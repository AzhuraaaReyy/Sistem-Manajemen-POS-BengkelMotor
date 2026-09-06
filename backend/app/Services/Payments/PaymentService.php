<?php

namespace App\Services\Payments;

use App\Models\AuditLog;
use App\Models\PaymentCharge;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\ServiceOrder;
use App\Models\StockMovement;
use App\Services\Audit\AuditService;
use App\Services\Inventory\StockLedger;
use App\Services\Payments\Contracts\PaymentGateway;
use App\Services\Payments\DTO\GatewayNotification;
use App\Services\Payments\DTO\PendingChargeRequest;
use App\Exceptions\PaymentGatewayUnavailableException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class PaymentService
{
    public function __construct(
        private PaymentGateway $gateway,
        private AuditService $audit,
        private StockLedger $ledger,
    ) {}

    public function startOnlinePayment(Sale $sale, string $method): Sale
    {
        if ($sale->status !== Sale::STATUS_DRAFT) {
            throw new RuntimeException('Only DRAFT sales can be sent for payment.', 409);
        }
        if (!in_array($method, Sale::ONLINE_METHODS, true)) {
            throw new RuntimeException("Method {$method} is not an online method.", 422);
        }

        return DB::transaction(function () use ($sale, $method) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            if ($sale->status !== Sale::STATUS_DRAFT) {
                throw new RuntimeException('Only DRAFT sales can be sent for payment.', 409);
            }
            $sale->load('items');

            $cashier = auth()->user();
            if (!$cashier) {
                throw new RuntimeException('Unauthenticated.', 401);
            }

            $productItems = $sale->items->where('item_type', SaleItem::TYPE_PRODUCT);
            $this->ledger->decrementForSale($sale, $productItems, $cashier->id, StockMovement::TYPE_SALE);

            try {
                $charge = $this->gateway->createCharge(new PendingChargeRequest(
                    orderId: $sale->id,
                    saleCode: $sale->sale_code,
                    method: $method,
                    grossAmount: (string) $sale->grand_total,
                    items: $sale->items->map(fn ($i) => [
                        'id' => $i->product_id ?? $i->service_id,
                        'name' => $i->item_name_snapshot,
                        'price' => (float) $i->unit_price,
                        'quantity' => $i->quantity,
                    ])->all(),
                    customer: $sale->customer ? ['first_name' => $sale->customer->name] : null,
                ));
            } catch (\Throwable $e) {
                Log::warning('Payment gateway unavailable: ' . $e->getMessage(), ['sale_id' => $sale->id, 'method' => $method]);
                throw new PaymentGatewayUnavailableException($sale->id);
            }

            PaymentCharge::create([
                'sale_id' => $sale->id,
                'method' => $method,
                'amount' => $sale->grand_total,
                'status' => PaymentCharge::STATUS_PENDING,
                'gateway_transaction_id' => $charge->gatewayTransactionId,
                'gateway_type' => match ($method) {
                    'VA' => 'bank_transfer',
                    default => strtolower($method),
                },
                'va_number' => $charge->vaNumber,
                'qr_url' => $charge->qrUrl,
                'qr_string' => $charge->qrString,
                'deeplink' => $charge->deepLink,
                'expires_at' => $charge->expiresAt,
            ]);

            $sale->status = Sale::STATUS_PENDING;
            $sale->payment_method = $method;
            $sale->save();

            $this->audit->log(
                AuditLog::ACTION_SALE_CHECKOUT,
                'sale', $sale->id, null,
                ['sale_code' => $sale->sale_code, 'grand_total' => $sale->grand_total, 'status' => $sale->status, 'method' => $method]
            );

            $sale->refresh();
            return $sale;
        }, 5);
    }

    public function settleFromGateway(GatewayNotification $n): Sale
    {
        $sale = Sale::where('sale_code', $n->orderId)->first();
        if (!$sale) {
            throw new RuntimeException('Unknown order_id.', 404);
        }

        return DB::transaction(function () use ($sale, $n) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            if ($sale->status === Sale::STATUS_PAID) {
                return $sale;
            }
            if ($sale->status !== Sale::STATUS_PENDING) {
                throw new RuntimeException('Only PENDING sales can be settled.', 409);
            }

            $charge = $sale->paymentCharges()
                ->where('gateway_transaction_id', $n->gatewayTransactionId)
                ->lockForUpdate()
                ->first();

            if (!$charge) {
                $charge = $sale->paymentCharges()
                    ->where('status', PaymentCharge::STATUS_PENDING)
                    ->latest('id')
                    ->lockForUpdate()
                    ->first();
            }

            if (!$charge) {
                throw new RuntimeException('No matching charge for this sale.', 404);
            }
            if (bccomp($n->grossAmount, (string) $charge->amount, 2) !== 0) {
                throw new RuntimeException('Amount mismatch.', 422);
            }
            if ($charge->status === PaymentCharge::STATUS_PAID) {
                throw new RuntimeException('Charge already settled.', 409);
            }

            $charge->status = PaymentCharge::STATUS_PAID;
            $charge->paid_at = now();
            $charge->gateway_transaction_id = $n->gatewayTransactionId ?: $charge->gateway_transaction_id;
            $charge->save();

            $sale->status = Sale::STATUS_PAID;
            $sale->paid_at = now();
            $sale->save();

            if ($sale->service_order_id) {
                $so = ServiceOrder::whereKey($sale->service_order_id)->lockForUpdate()->first();
                if ($so && !in_array($so->status, [ServiceOrder::STATUS_DONE, ServiceOrder::STATUS_CANCELLED], true)) {
                    $so->status = ServiceOrder::STATUS_DONE;
                    $so->completed_at = now();
                    $so->save();
                }
            }

            $this->audit->log(
                AuditLog::ACTION_SALE_CHECKOUT,
                'sale', $sale->id, null,
                ['sale_code' => $sale->sale_code, 'status' => $sale->status, 'gateway_transaction_id' => $n->gatewayTransactionId]
            );

            $sale->refresh();
            return $sale;
        }, 5);
    }

    public function expire(Sale $sale, ?string $reason = null): Sale
    {
        return DB::transaction(function () use ($sale, $reason) {
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            if ($sale->status === Sale::STATUS_EXPIRED) {
                return $sale;
            }
            if ($sale->status !== Sale::STATUS_PENDING) {
                throw new RuntimeException('Only PENDING sales can be expired.', 409);
            }
            $sale->load('items');

            // Update payment charge status to EXPIRED
            $sale->paymentCharges()
                ->where('status', PaymentCharge::STATUS_PENDING)
                ->update(['status' => PaymentCharge::STATUS_EXPIRED]);

            // Return stock untuk product items
            $actor = auth()->id() ?? $sale->cashier_id;
            $productItems = $sale->items->where('item_type', SaleItem::TYPE_PRODUCT);
            $this->ledger->incrementForSale($sale, $productItems, (int) $actor, StockMovement::TYPE_SALE_REVERSAL);

            $sale->status = Sale::STATUS_EXPIRED;
            $sale->save();

            $this->audit->log(
                AuditLog::ACTION_SALE_VOIDED,
                'sale', $sale->id, null,
                ['sale_code' => $sale->sale_code, 'status' => $sale->status],
                $reason ?? 'Pembayaran kedaluwarsa / dibatalkan.',
                $actor
            );

            // Dispatch notification
            try {
                $notificationService = app(\App\Services\Notifications\NotificationService::class);
                $notificationService->create(
                    $sale->cashier,
                    'TRANSACTION',
                    'Transaksi Kedaluwarsa',
                    "Transaksi {$sale->sale_code} kedaluwarsa (waktu pembayaran 5 menit habis)",
                    [
                        'sale_id' => $sale->id,
                        'sale_code' => $sale->sale_code,
                        'amount' => $sale->grand_total,
                        'reason' => $reason ?? 'Waktu pembayaran habis',
                    ]
                );
            } catch (\Exception $e) {
                // Silent fail - notification not critical
            }

            $sale->refresh();
            return $sale;
        }, 5);
    }
}
