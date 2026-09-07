<?php

// Smoke-test fitur pembayaran (CASH / QRIS / VA) dalam simulation mode.
// Menjalankan SELURUH alur produksi (checkout -> payment gateway -> settle /
// expire) termasuk fallback saat payment gateway benar-benar down (P8).
//
// Run dengan: php artisan tinker --execute="require 'scripts/payment-smoke-test.php';"
//
// Catatan:
// - Memaksa FakePaymentGateway (server_key kosong) + queue sync + broadcast
//   null, sehingga deterministik dan tanpa server/worker/jaringan.
// - Setiap skenario memakai sale_code unik; data uji dibersihkan otomatis di
//   akhir (kecuali env KEEP_TEST_DATA=1).
// - Jalankan dua kali: P1-P8 harus PASS dua-duanya.

use App\Exceptions\PaymentGatewayUnavailableException;
use App\Models\Notification;
use App\Models\PaymentCharge;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Services\Payments\Contracts\PaymentGateway;
use App\Services\Payments\DTO\GatewayNotification;
use App\Services\Payments\Gateways\FakePaymentGateway;
use App\Services\Payments\PaymentService;
use App\Services\Sales\CheckoutSaleService;
use Illuminate\Support\Facades\Http;

// --- Konfigurasi runtime (deterministik, tanpa dependensi eksternal) ---
config(['services.midtrans.server_key' => '']);      // paksa FakePaymentGateway
config(['queue.default' => 'sync']);                 // job jalan inline
config(['broadcasting.default' => 'null']);          // tanpa Reverb

$state = ['results' => [], 'failures' => 0];

$check = function (string $label, bool $ok, string $detail = '') use (&$state): void {
    $state['results'][] = $label;
    $status = $ok ? '[PASS]' : '[FAIL]';
    if (!$ok) {
        $state['failures']++;
    }
    echo "$status $label" . ($detail !== '' ? "  ($detail)" : '') . PHP_EOL;
};

function smokeSaleCode(): string
{
    return 'SMK-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
}

$scenarioError = '';
$cashier = null;
$product = null;
$saleIds = [];

try {
    // ---------- Fixture: cashier, product, service ----------
    $cashier = User::where('email', 'payment-smoke@bengkel.test')->first();
    if (!$cashier) {
        $cashier = User::factory()->cashier()->create([
            'email' => 'payment-smoke@bengkel.test',
        ]);
    }
    // tinker/jalankan via console tidak punya session guard -> setUser, bukan login().
    Auth::setUser($cashier);

    $product = Product::where('sku', 'SMOKE-PAY-01')->first();
    if (!$product) {
        $product = Product::factory()->create([
            'sku' => 'SMOKE-PAY-01',
            'name' => '[SMOKE] Payment Gateway',
            'current_stock' => 50,
            'sale_price' => 10000,
            'purchase_price' => 6000,
        ]);
    }
    $product->current_stock = 50;
    $product->save();
    $product->refresh();

    $checkoutSvc = app(CheckoutSaleService::class);
    $paymentSvc = app(PaymentService::class);

    $makeSale = function () use ($cashier, $product, &$saleIds): Sale {
        $sale = Sale::factory()->for($cashier, 'cashier')->create([
            'sale_code' => smokeSaleCode(),
        ]);
        $sale->items()->create([
            'item_type' => SaleItem::TYPE_PRODUCT,
            'product_id' => $product->id,
            'quantity' => 2,
            'unit_price' => 10000,
            'subtotal' => 20000,
            'item_name_snapshot' => $product->name,
        ]);
        $sale->update(['subtotal' => 20000, 'grand_total' => 20000]);
        $saleIds[] = $sale->id;

        return $sale;
    };

    // ---------- P1: CASH ----------
    $p1Sale = $makeSale();
    $p1 = $checkoutSvc->checkout($p1Sale, Sale::PAYMENT_CASH, 20000, 0);
    $check('P1 CASH -> PAID tanpa charge', $p1->status === Sale::STATUS_PAID);
    $check('P1 tidak ada payment_charge', PaymentCharge::where('sale_id', $p1Sale->id)->count() === 0);

    // ---------- P2: QRIS lewat FakePaymentGateway + settle ----------
    $p2Sale = $makeSale();
    $p2StockBefore = (int) $product->refresh()->current_stock;
    $p2 = $checkoutSvc->checkout($p2Sale, Sale::PAYMENT_QRIS, null, 0);
    $check('P2 QRIS (Fake) -> PENDING', $p2->status === Sale::STATUS_PENDING);
    $p2Charge = PaymentCharge::where('sale_id', $p2Sale->id)->first();
    $check('P2 charge gateway_type=qris + qr_url ada',
        $p2Charge && $p2Charge->gateway_type === 'qris' && $p2Charge->qr_url !== null);
    $check('P2 stok berkurang 2 saat PENDING',
        (int) $product->refresh()->current_stock === $p2StockBefore - 2);
    $p2Paid = $paymentSvc->settleFromGateway(new GatewayNotification(
        orderId: $p2Sale->sale_code,
        status: 'PAID',
        grossAmount: '20000.00',
        gatewayTransactionId: $p2Charge->gateway_transaction_id,
    ));
    $check('P2 settle -> PAID', $p2Paid->status === Sale::STATUS_PAID);

    // ---------- P3: VA lewat FakePaymentGateway ----------
    $p3Sale = $makeSale();
    $p3 = $checkoutSvc->checkout($p3Sale, Sale::PAYMENT_VA, null, 0);
    $check('P3 VA (Fake) -> PENDING', $p3->status === Sale::STATUS_PENDING);
    $p3Charge = PaymentCharge::where('sale_id', $p3Sale->id)->first();
    $check('P3 charge gateway_type=bank_transfer + va_number',
        $p3Charge && $p3Charge->gateway_type === 'bank_transfer' && $p3Charge->va_number === '1234567890');

    // ---------- P4: Settle lewat "webhook" ----------
    $p4Sale = $makeSale();
    $checkoutSvc->checkout($p4Sale, Sale::PAYMENT_QRIS, null, 0);
    $p4 = $paymentSvc->settleFromGateway(new GatewayNotification(
        orderId: $p4Sale->sale_code,
        status: 'PAID',
        grossAmount: '20000.00',
        gatewayTransactionId: 'TX-WEBHOOK-' . $p4Sale->id,
    ));
    $check('P4 webhook settle -> PAID + paid_at terisi',
        $p4->status === Sale::STATUS_PAID && $p4->paid_at !== null);

    // ---------- P5: Double-settle idempoten ----------
    $p5Sale = $makeSale();
    $checkoutSvc->checkout($p5Sale, Sale::PAYMENT_QRIS, null, 0);
    $p5Notif = new GatewayNotification(
        orderId: $p5Sale->sale_code,
        status: 'PAID',
        grossAmount: '20000.00',
        gatewayTransactionId: 'TX-P5',
    );
    $p5First = $paymentSvc->settleFromGateway($p5Notif);
    $p5Second = $paymentSvc->settleFromGateway($p5Notif);
    $p5ChargeCount = PaymentCharge::where('sale_id', $p5Sale->id)->count();
    $p5Charge = PaymentCharge::where('sale_id', $p5Sale->id)->first();
    $check('P5 settle dua kali idempoten (sale tetap PAID)',
        $p5First->status === Sale::STATUS_PAID && $p5Second->status === Sale::STATUS_PAID);
    $check('P5 hanya satu charge berstatus PAID',
        $p5ChargeCount === 1 && $p5Charge && $p5Charge->status === PaymentCharge::STATUS_PAID);

    // ---------- P6: Expire mengembalikan stok ----------
    $p6Sale = $makeSale();
    $p6StockBefore = (int) $product->refresh()->current_stock;
    $checkoutSvc->checkout($p6Sale, Sale::PAYMENT_QRIS, null, 0);
    $p6 = $paymentSvc->expire($p6Sale);
    $p6Charge = PaymentCharge::where('sale_id', $p6Sale->id)->first();
    $check('P6 expire -> EXPIRED + charge EXPIRED',
        $p6->status === Sale::STATUS_EXPIRED && $p6Charge && $p6Charge->status === PaymentCharge::STATUS_EXPIRED);
    $check('P6 stok dikembalikan penuh', (int) $product->refresh()->current_stock === $p6StockBefore);

    // ---------- P7: gross_amount mismatch ditolak ----------
    $p7Sale = $makeSale();
    $checkoutSvc->checkout($p7Sale, Sale::PAYMENT_QRIS, null, 0);
    $mismatch = false;
    try {
        $paymentSvc->settleFromGateway(new GatewayNotification(
            orderId: $p7Sale->sale_code,
            status: 'PAID',
            grossAmount: '12345.67',
            gatewayTransactionId: 'TX-MISMATCH',
        ));
    } catch (RuntimeException $e) {
        $mismatch = $e->getCode() === 422 && $e->getMessage() === 'Amount mismatch.';
    }
    $check('P7 gross_amount tidak cocok ditolak (422)', $mismatch);

    // ---------- P8: Fallback saat payment gateway benar-benar down ----------
    $p8Sale = $makeSale();
    $p8StockBefore = (int) $product->refresh()->current_stock;

    config(['services.midtrans.server_key' => 'SB-Mid-server-smoke']);
    app()->forgetInstance(PaymentGateway::class);
    Http::fake(['api.sandbox.midtrans.com/*' => Http::response('Service Unavailable', 503)]);

    // Resolve service FRESH supaya PaymentService-nya menangkap MidtransGateway.
    $p8Svc = app(CheckoutSaleService::class);

    $fallbackCaught = false;
    try {
        $p8Svc->checkout($p8Sale, Sale::PAYMENT_QRIS, null, 0);
    } catch (PaymentGatewayUnavailableException $e) {
        $fallbackCaught = $e->getCode() === 503
            && str_contains($e->getMessage(), 'tunai')
            && $e->saleId === $p8Sale->id;
    }
    $check('P8 QRIS checkout jatuh ke fallback 503 (gateway down)', $fallbackCaught);

    $p8Reloaded = Sale::whereKey($p8Sale->id)->first();
    $check('P8 sale tetap DRAFT setelah fallback', $p8Reloaded->status === Sale::STATUS_DRAFT);
    $check('P8 stok tidak berubah setelah fallback',
        (int) $product->refresh()->current_stock === $p8StockBefore);

    // Sale yang sama langsung bisa dibayar tunai (kasir tetap bisa melayani).
    $p8Cash = $p8Svc->checkout($p8Sale, Sale::PAYMENT_CASH, 20000, 0);
    $check('P8 sale yang sama berhasil dibayar tunai setelah fallback',
        $p8Cash->status === Sale::STATUS_PAID);
    $check('P8 stok berkurang tepat sekali (2)',
        (int) $product->refresh()->current_stock === $p8StockBefore - 2);

    // Reset ke keadaan semula agar residual config/fake tidak bocor.
    Http::fake([]);
    config(['services.midtrans.server_key' => '']);
    app()->forgetInstance(PaymentGateway::class);
    $check('P8 gateway kembali ke FakePaymentGateway setelah reset',
        app(PaymentGateway::class) instanceof FakePaymentGateway);

} catch (\Throwable $e) {
    $scenarioError = get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine();
    echo "[FAIL] EXCEPTION TAK TERDUGA: $scenarioError" . PHP_EOL;
    $state['failures']++;

} finally {
    // ---------- Cleanup ----------
    if (getenv('KEEP_TEST_DATA') !== '1') {
        if (!empty($saleIds)) {
            foreach ($saleIds as $sid) {
                try {
                    Notification::whereJsonContains('data->sale_id', $sid)->delete();
                } catch (\Throwable) {
                    Notification::where('data', 'like', "%\"sale_id\":$sid%")->delete();
                }
            }
            // Cascade menghapus sale_items + payment_charges otomatis.
            Sale::whereIn('id', $saleIds)->delete();
        }
        if ($product) {
            $product->current_stock = 50;
            $product->save();
        }
        echo "\n[Cleanup] data uji dihapus (sales/items/charges/notifikasi) & stok dikembalikan ke 50.\n";
    } else {
        echo "\n[Skip cleanup] KEEP_TEST_DATA=1 — data uji dipertahankan.\n";
    }
}

// ---------- Ringkasan ----------
echo "\n=== RINGKASAN ===\n";
echo 'Total: ' . count($state['results']) . ' cek, ' . $state['failures'] . ' gagal' . ($scenarioError ? " | EXCEPTION: $scenarioError" : '') . PHP_EOL;

exit($state['failures'] > 0 ? 1 : 0);
