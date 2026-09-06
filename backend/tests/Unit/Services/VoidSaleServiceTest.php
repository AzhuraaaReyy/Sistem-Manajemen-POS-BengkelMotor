<?php

namespace Tests\Unit\Services;

use App\Models\AuditLog;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use App\Services\Sales\CheckoutSaleService;
use App\Services\Sales\VoidSaleService;
use RuntimeException;
use Tests\TestCase;

class VoidSaleServiceTest extends TestCase
{
    private function paidSaleWithProduct(int $stock = 10, int $qty = 3): array
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $sale = Sale::factory()->for($cashier, 'cashier')->create();
        $product = Product::factory()->create(['current_stock' => $stock, 'sale_price' => 10000]);

        $sale->items()->create([
            'item_type' => SaleItem::TYPE_PRODUCT,
            'product_id' => $product->id,
            'item_name_snapshot' => $product->name,
            'quantity' => $qty,
            'unit_price' => 0,
            'subtotal' => 0,
        ]);

        $paid = app(CheckoutSaleService::class)->checkout($sale, 'CASH', 100000, 0);

        return [$paid, $product];
    }

    public function test_admin_can_void_paid_sale_and_stock_is_restored(): void
    {
        [$sale, $product] = $this->paidSaleWithProduct(stock: 10, qty: 3);
        $stockAfterSale = $product->fresh()->current_stock;

        $admin = $this->admin();
        $this->actingAs($admin);

        $voided = app(VoidSaleService::class)->void($sale, 'Pelanggan salah bayar');

        $this->assertSame(Sale::STATUS_VOID, $voided->status);
        $this->assertSame($admin->id, $voided->voided_by);
        $this->assertSame('Pelanggan salah bayar', $voided->void_reason);
        $this->assertNotNull($voided->voided_at);

        $product->refresh();
        $this->assertEquals(10, (float) $product->current_stock);
        $this->assertNotEquals($stockAfterSale, $product->current_stock);

        $movement = StockMovement::where('product_id', $product->id)
            ->where('type', StockMovement::TYPE_VOID_RETURN)
            ->first();
        $this->assertNotNull($movement);
        $this->assertEquals(3, (float) $movement->quantity_change);

        $this->assertTrue(
            AuditLog::where('action', AuditLog::ACTION_SALE_VOIDED)->where('entity_id', $sale->id)->exists()
        );
    }

    public function test_cashier_cannot_void_paid_sale(): void
    {
        [$sale] = $this->paidSaleWithProduct();
        $cashier = $this->cashier();
        $this->actingAs($cashier);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionCode(403);

        app(VoidSaleService::class)->void($sale, 'Alasan apapun');
    }

    public function test_void_requires_non_blank_reason(): void
    {
        [$sale] = $this->paidSaleWithProduct();
        $this->actingAs($this->admin());

        $this->expectException(RuntimeException::class);
        $this->expectExceptionCode(422);

        app(VoidSaleService::class)->void($sale, '   ');
    }

    public function test_cashier_can_void_draft_sale(): void
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $sale = Sale::factory()->for($cashier, 'cashier')->create();

        $voided = app(VoidSaleService::class)->void($sale, 'Alasan');

        $this->assertSame(Sale::STATUS_VOID, $voided->status);
        $this->assertSame($cashier->id, $voided->voided_by);
        $this->assertSame('Alasan', $voided->void_reason);

        $this->assertSame(
            0,
            StockMovement::where('reference_type', 'sale')
                ->where('reference_id', $sale->id)
                ->where('type', StockMovement::TYPE_VOID_RETURN)
                ->count()
        );
    }

    public function test_cannot_void_already_voided_sale(): void
    {
        [$sale, $product] = $this->paidSaleWithProduct(stock: 10, qty: 3);
        $this->actingAs($this->admin());

        app(VoidSaleService::class)->void($sale, 'Pertama');
        $stockAfterFirstVoid = $product->fresh()->current_stock;

        $this->expectException(RuntimeException::class);

        try {
            app(VoidSaleService::class)->void($sale->fresh(), 'Kedua');
        } finally {
            $this->assertEquals($stockAfterFirstVoid, $product->fresh()->current_stock);
            $this->assertSame(
                1,
                StockMovement::where('product_id', $product->id)
                    ->where('type', StockMovement::TYPE_VOID_RETURN)
                    ->count()
            );
        }
    }
}
