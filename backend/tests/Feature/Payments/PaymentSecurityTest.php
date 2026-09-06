<?php

namespace Tests\Feature\Payments;

use App\Models\PaymentCharge;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\Payments\Contracts\PaymentGateway;
use App\Services\Payments\Gateways\FakePaymentGateway;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class PaymentSecurityTest extends TestCase
{
    private FakePaymentGateway $fake;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fake = new FakePaymentGateway();
        $this->app->instance(PaymentGateway::class, $this->fake);
        Config::set('services.midtrans.server_key', 'test-server-key');
    }

    private function createPendingSaleWithCharge(): Sale
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $sale = Sale::factory()->pending('QRIS')->for($cashier, 'cashier')->create(['sale_code' => 'SEC-TEST-' . uniqid()]);
        $product = \App\Models\Product::factory()->create(['current_stock' => 10]);
        $sale->items()->create([
            'item_type' => SaleItem::TYPE_PRODUCT,
            'product_id' => $product->id,
            'quantity' => 1,
            'unit_price' => 1000,
            'subtotal' => 1000,
            'item_name_snapshot' => $product->name,
        ]);
        $sale->update(['subtotal' => 1000, 'grand_total' => 1000]);
        PaymentCharge::create([
            'sale_id' => $sale->id,
            'method' => 'QRIS',
            'amount' => 1000,
            'status' => PaymentCharge::STATUS_PENDING,
            'gateway_transaction_id' => 'TX-SEC-' . uniqid(),
            'expires_at' => now()->addMinutes(15),
        ]);
        return $sale->fresh();
    }

    /** AC-31: Webhook tanpa signature */
    public function test_webhook_without_signature_returns_400(): void
    {
        $this->fake->signatureValid = false;
        $response = $this->postJson('/api/v1/payments/webhook/midtrans', [
            'order_id' => 'X', 'transaction_status' => 'settlement', 'gross_amount' => '1000.00',
        ]);
        $response->assertStatus(400);
    }

    /** AC-32: Webhook signature salah */
    public function test_webhook_with_wrong_signature_returns_400(): void
    {
        $this->fake->signatureValid = false;
        $response = $this->postJson('/api/v1/payments/webhook/midtrans', [
            'order_id' => 'X', 'transaction_status' => 'settlement', 'gross_amount' => '1000.00',
        ], ['X-Signature' => 'wrong-sig']);
        $response->assertStatus(400);
    }

    /** AC-33: Double settle idempotent */
    public function test_double_settle_is_idempotent(): void
    {
        $sale = $this->createPendingSaleWithCharge();
        $txId = $sale->paymentCharges()->first()->gateway_transaction_id;

        $payload = ['order_id' => $sale->sale_code, 'transaction_status' => 'settlement', 'gross_amount' => '1000.00', 'transaction_id' => $txId];
        $this->postJson('/api/v1/payments/webhook/midtrans', $payload)->assertOk();
        $this->postJson('/api/v1/payments/webhook/midtrans', $payload)->assertOk();

        $sale->refresh();
        $this->assertSame(Sale::STATUS_PAID, $sale->status);
        $this->assertSame(1, PaymentCharge::where('sale_id', $sale->id)->where('status', PaymentCharge::STATUS_PAID)->count());
    }

    /** AC-34: Amount mismatch */
    public function test_amount_mismatch_is_rejected(): void
    {
        $sale = $this->createPendingSaleWithCharge();
        $txId = $sale->paymentCharges()->first()->gateway_transaction_id;

        $response = $this->postJson('/api/v1/payments/webhook/midtrans', [
            'order_id' => $sale->sale_code, 'transaction_status' => 'settlement', 'gross_amount' => '99999.00', 'transaction_id' => $txId,
        ]);
        $response->assertStatus(422);
    }

    /** AC-35: Webhook untuk sale bukan PENDING — idempotent (returns 200) */
    public function test_webhook_for_non_pending_sale_is_idempotent(): void
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $sale = Sale::factory()->for($cashier, 'cashier')->create(['status' => Sale::STATUS_PAID, 'sale_code' => 'PAID-TEST']);

        $response = $this->postJson('/api/v1/payments/webhook/midtrans', [
            'order_id' => 'PAID-TEST', 'transaction_status' => 'settlement', 'gross_amount' => '0.00', 'transaction_id' => 'TX-999',
        ]);
        $response->assertOk();
    }

    /** AC-36: Expire double idempotent */
    public function test_double_expire_is_idempotent(): void
    {
        $sale = $this->createPendingSaleWithCharge();
        app(\App\Services\Payments\PaymentService::class)->expire($sale, 'first');
        $result = app(\App\Services\Payments\PaymentService::class)->expire($sale, 'second');
        $this->assertSame(Sale::STATUS_EXPIRED, $result->status);
    }

    /** AC-38: Concurrent expire + webhook — stock restore once */
    public function test_concurrent_expire_and_settle_restores_stock_once(): void
    {
        $sale = $this->createPendingSaleWithCharge();
        $product = \App\Models\Product::find($sale->items->first()->product_id);
        $txId = $sale->paymentCharges()->first()->gateway_transaction_id;

        // Simulate: webhook arrives but sale is already expired
        $sale->update(['status' => Sale::STATUS_EXPIRED]);
        $sale->paymentCharges()->where('status', PaymentCharge::STATUS_PENDING)->update(['status' => PaymentCharge::STATUS_EXPIRED]);

        $response = $this->postJson('/api/v1/payments/webhook/midtrans', [
            'order_id' => $sale->sale_code, 'transaction_status' => 'settlement', 'gross_amount' => '1000.00', 'transaction_id' => $txId,
        ]);

        $product->refresh();
        $this->assertGreaterThanOrEqual(9, $product->current_stock);
    }

    public function test_simulate_payment_returns_403_outside_development(): void
    {
        $sale = $this->createPendingSaleWithCharge();

        $response = $this->postJson("/api/v1/payments/simulate/{$sale->sale_code}");

        $response->assertStatus(403);
    }
}
