<?php

namespace Tests\Feature\Sales;

use App\Models\AuditLog;
use App\Models\Product;
use App\Models\Sale;
use App\Models\StockMovement;
use Tests\TestCase;

class VoidSaleTest extends TestCase
{
    private function paidSale(int $stock = 10, int $qty = 2, float $price = 20000): array
    {
        $cashier = $this->cashier();
        $product = Product::factory()->create(['sale_price' => $price, 'current_stock' => $stock]);

        $saleId = $this->actingAs($cashier)->postJson('/api/v1/sales', [
            'items' => [['item_type' => 'PRODUCT', 'product_id' => $product->id, 'quantity' => $qty]],
        ])->json('data.id');

        $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/checkout", ['payment_method' => 'CASH', 'paid_amount' => 50000]);

        return [$saleId, $product];
    }

    public function test_cashier_cannot_void_a_paid_sale(): void
    {
        [$saleId] = $this->paidSale();
        $cashier = $this->cashier();

        $response = $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/void", ['reason' => 'Salah input']);

        $response->assertStatus(403);
        $this->assertSame(Sale::STATUS_PAID, Sale::find($saleId)->status);
    }

    public function test_admin_can_void_a_paid_sale_with_reason_and_stock_is_restored(): void
    {
        [$saleId, $product] = $this->paidSale(stock: 10, qty: 3);
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson("/api/v1/sales/{$saleId}/void", ['reason' => 'Pelanggan batal']);

        $response->assertStatus(200)->assertJsonPath('data.status', 'VOID');
        $this->assertEquals(10, (float) $product->fresh()->current_stock);
        $this->assertTrue(
            AuditLog::where('action', AuditLog::ACTION_SALE_VOIDED)->where('entity_id', $saleId)->exists()
        );
    }

    public function test_void_without_reason_is_rejected(): void
    {
        [$saleId] = $this->paidSale();
        $admin = $this->admin();

        $response = $this->actingAs($admin)->postJson("/api/v1/sales/{$saleId}/void", ['reason' => '']);

        $response->assertStatus(422);
    }

    public function test_voiding_twice_is_rejected_and_does_not_double_restock(): void
    {
        [$saleId, $product] = $this->paidSale(stock: 10, qty: 3);
        $admin = $this->admin();

        $this->actingAs($admin)->postJson("/api/v1/sales/{$saleId}/void", ['reason' => 'Pertama'])->assertStatus(200);
        $stockAfterFirstVoid = $product->fresh()->current_stock;

        $second = $this->actingAs($admin)->postJson("/api/v1/sales/{$saleId}/void", ['reason' => 'Kedua']);

        $second->assertStatus(409);
        $this->assertEquals($stockAfterFirstVoid, $product->fresh()->current_stock);
        $this->assertSame(
            1,
            StockMovement::where('sale_id', $saleId)->where('type', StockMovement::TYPE_VOID_RETURN)->count()
        );
    }

    public function test_cashier_can_void_draft_sale(): void
    {
        $cashier = $this->cashier();
        $product = Product::factory()->create();

        $saleId = $this->actingAs($cashier)->postJson('/api/v1/sales', [
            'items' => [['item_type' => 'PRODUCT', 'product_id' => $product->id, 'quantity' => 1]],
        ])->json('data.id');

        $response = $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/void", ['reason' => 'Void draft sale']);

        $response->assertStatus(200)->assertJsonPath('data.status', 'VOID');
        $this->assertSame(
            0,
            StockMovement::where('sale_id', $saleId)->where('type', StockMovement::TYPE_VOID_RETURN)->count()
        );
    }

    public function test_voided_by_cannot_be_spoofed_via_request_body(): void
    {
        [$saleId] = $this->paidSale();
        $admin = $this->admin();
        $otherAdmin = $this->admin();

        $this->actingAs($admin)->postJson("/api/v1/sales/{$saleId}/void", [
            'reason' => 'Alasan sah',
            'voided_by' => $otherAdmin->id,
        ]);

        $this->assertSame($admin->id, Sale::find($saleId)->voided_by);
    }
}
