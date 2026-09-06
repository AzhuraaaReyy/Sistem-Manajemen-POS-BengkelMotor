<?php

namespace Tests\Feature\Payments;

use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\Payments\Contracts\PaymentGateway;
use App\Services\Payments\Gateways\FakePaymentGateway;
use Tests\TestCase;

class OnlineCheckoutTest extends TestCase
{
    private FakePaymentGateway $fake;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fake = new FakePaymentGateway();
        $this->app->instance(PaymentGateway::class, $this->fake);
    }

    public function test_checkout_with_qris_creates_pending_sale_and_charge(): void
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

        $response = $this->postJson("/api/v1/sales/{$sale->id}/checkout", [
            'payment_method' => 'QRIS',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'PENDING');
        $this->assertDatabaseHas('payment_charges', [
            'sale_id' => $sale->id,
            'status' => 'PENDING',
        ]);
        $product->refresh();
        $this->assertSame(8, $product->current_stock);
    }

    public function test_checkout_with_cash_creates_paid_sale_without_charge(): void
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

        $response = $this->postJson("/api/v1/sales/{$sale->id}/checkout", [
            'payment_method' => 'CASH',
            'paid_amount' => 2000,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'PAID');
        $this->assertDatabaseCount('payment_charges', 0);
    }

    public function test_checkout_with_va_creates_pending_sale_and_charge(): void
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

        $response = $this->postJson("/api/v1/sales/{$sale->id}/checkout", [
            'payment_method' => 'VA',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'PENDING');
        $this->assertDatabaseHas('payment_charges', [
            'sale_id' => $sale->id,
            'method' => 'VA',
            'status' => 'PENDING',
        ]);
        $product->refresh();
        $this->assertSame(8, $product->current_stock);
    }

    public function test_sale_resource_does_not_expose_gateway_raw_response(): void
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $sale = Sale::factory()->pending('QRIS')->for($cashier, 'cashier')->create();
        \App\Models\PaymentCharge::create([
            'sale_id' => $sale->id,
            'method' => 'QRIS',
            'amount' => 1000,
            'status' => 'PENDING',
            'gateway_transaction_id' => 'TX-001',
            'expires_at' => now()->addMinutes(15),
        ]);

        $response = $this->getJson("/api/v1/sales/{$sale->id}");

        $response->assertOk();
        $response->assertJsonStructure(['data' => [
            'gateway_transaction_id',
            'gateway_type',
            'gateway_va_number',
            'gateway_qr_url',
            'gateway_qr_string',
            'gateway_deeplink',
            'payment_expires_at',
        ]]);
        $response->assertJsonMissing(['gateway_raw_response' => null]);
    }
}
