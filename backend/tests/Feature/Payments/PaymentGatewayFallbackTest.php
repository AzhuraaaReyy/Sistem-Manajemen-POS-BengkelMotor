<?php

namespace Tests\Feature\Payments;

use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\Payments\Contracts\PaymentGateway;
use App\Services\Payments\Gateways\MidtransGateway;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PaymentGatewayFallbackTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->app->instance(PaymentGateway::class, new MidtransGateway());
        config(['services.midtrans.server_key' => 'SB-Mid-server-test']);
    }

    private function makeSale(): Sale
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $sale = Sale::factory()->for($cashier, 'cashier')->create();
        $product = Product::factory()->create(['current_stock' => 10, 'sale_price' => 1000]);
        $sale->items()->create([
            'item_type' => SaleItem::TYPE_PRODUCT,
            'product_id' => $product->id,
            'quantity' => 2,
            'unit_price' => 1000,
            'subtotal' => 2000,
            'item_name_snapshot' => $product->name,
        ]);
        $sale->update(['subtotal' => 2000, 'grand_total' => 2000]);

        return $sale->fresh();
    }

    public function test_checkout_qris_returns_503_payment_gateway_unavailable_when_gateway_5xx(): void
    {
        $sale = $this->makeSale();

        Http::fake(['api.sandbox.midtrans.com/*' => Http::response('Service Unavailable', 503, ['Content-Type' => 'application/json'])]);

        $response = $this->postJson("/api/v1/sales/{$sale->id}/checkout", [
            'payment_method' => 'QRIS',
        ]);

        $response->assertStatus(503);
        $response->assertJsonPath('code', 'PAYMENT_GATEWAY_UNAVAILABLE');
        $response->assertJsonPath('sale_id', $sale->id);
        $response->assertJsonPath('message', 'Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.');

        $sale->refresh();
        $this->assertSame(Sale::STATUS_DRAFT, $sale->status);

        $product = Product::find($sale->items->first()->product_id);
        $this->assertSame(10, $product->current_stock);

        $this->assertDatabaseCount('payment_charges', 0);
    }

    public function test_checkout_qris_returns_503_payment_gateway_unavailable_when_gateway_connection_error(): void
    {
        $sale = $this->makeSale();

        Http::fake(['api.sandbox.midtrans.com/*' => fn () => throw new ConnectionException('Connection refused')]);

        $response = $this->postJson("/api/v1/sales/{$sale->id}/checkout", [
            'payment_method' => 'QRIS',
        ]);

        $response->assertStatus(503);
        $response->assertJsonPath('code', 'PAYMENT_GATEWAY_UNAVAILABLE');
        $response->assertJsonPath('sale_id', $sale->id);
        $response->assertJsonPath('message', 'Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.');

        $sale->refresh();
        $this->assertSame(Sale::STATUS_DRAFT, $sale->status);

        $product = Product::find($sale->items->first()->product_id);
        $this->assertSame(10, $product->current_stock);

        $this->assertDatabaseCount('payment_charges', 0);
    }

    public function test_cash_checkout_on_same_sale_after_gateway_fallback(): void
    {
        $sale = $this->makeSale();

        Http::fake(['api.sandbox.midtrans.com/*' => Http::response('Service Unavailable', 503, ['Content-Type' => 'application/json'])]);

        $response = $this->postJson("/api/v1/sales/{$sale->id}/checkout", [
            'payment_method' => 'QRIS',
        ]);
        $response->assertStatus(503);

        $response = $this->postJson("/api/v1/sales/{$sale->id}/checkout", [
            'payment_method' => 'CASH',
            'paid_amount' => 2000,
        ]);
        $response->assertOk();
        $response->assertJsonPath('data.status', 'PAID');

        $product = Product::find($sale->items->first()->product_id);
        $this->assertSame(8, $product->current_stock);
    }
}
