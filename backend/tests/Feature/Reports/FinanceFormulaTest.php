<?php

namespace Tests\Feature\Reports;

use App\Models\Expense;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\Reports\ReportQueryService;
use App\Services\Sales\CheckoutSaleService;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FinanceFormulaTest extends TestCase
{
    private function checkoutProduct(Sale $sale, Product $product, int $qty): void
    {
        $sale->items()->create([
            'item_type' => SaleItem::TYPE_PRODUCT,
            'product_id' => $product->id,
            'item_name_snapshot' => $product->name,
            'quantity' => $qty,
            'unit_price' => 0,
            'subtotal' => 0,
        ]);
    }

    /**
     * @param int $daysBack number of days the range extends back (1 = today only)
     */
    private function runFinance(int $daysBack): array
    {
        $from = Carbon::now()->subDays($daysBack - 1)->startOfDay();
        $to = Carbon::now()->endOfDay();
        return app(ReportQueryService::class)->finance($from, $to);
    }

    public function test_finance_report_omzet_hpp_laba_kotor_and_laba_bersih_are_correct(): void
    {
        $cashier = $this->cashier();
        $admin = $this->admin();
        $this->actingAs($cashier);

        // Product A: sale 50k, purchase 30k, qty 3 -> revenue 150k, cogs 90k
        $a = Product::factory()->create(['sale_price' => 50000, 'purchase_price' => 30000, 'current_stock' => 10]);
        // Product B: sale 20k, purchase 12k, qty 5 -> revenue 100k, cogs 60k
        $b = Product::factory()->create(['sale_price' => 20000, 'purchase_price' => 12000, 'current_stock' => 10]);

        $s1 = Sale::factory()->for($cashier, 'cashier')->create();
        $this->checkoutProduct($s1, $a, 3);
        app(CheckoutSaleService::class)->checkout($s1, 'CASH', 200000, 0);

        $s2 = Sale::factory()->for($cashier, 'cashier')->create();
        $this->checkoutProduct($s2, $b, 5);
        app(CheckoutSaleService::class)->checkout($s2, 'CASH', 150000, 0);

        // Expense of 40k inside period.
        Expense::factory()->create(['amount' => 40000, 'expense_date' => now()->toDateString(), 'created_by' => $admin->id]);

        $finance = $this->runFinance(1);

        $summary = $finance['summary'];

        // Omzet (revenue) = grand_total of PAID sales = 150k + 100k = 250k
        $this->assertEquals(250000, (float) $summary['revenue']);
        // HPP (cogs) = purchase_price_snapshot * quantity = 90k + 60k = 150k
        $this->assertEquals(150000, (float) $summary['cogs']);
        // Beban = 40k
        $this->assertEquals(40000, (float) $summary['expenses']);
        // Laba kotor (gross profit) = revenue - cogs = 250k - 150k = 100k
        $grossProfit = (float) $summary['revenue'] - (float) $summary['cogs'];
        $this->assertEquals(100000, $grossProfit);
        // Laba bersih (net profit) = gross profit - expenses = 100k - 40k = 60k
        $netProfit = $grossProfit - (float) $summary['expenses'];
        $this->assertEquals(60000, $netProfit);
        // estimated_result must equal net profit
        $this->assertEquals(60000, (float) $summary['estimated_result']);
    }

    public function test_discount_reduces_revenue_but_cogs_stays_full_snapshot(): void
    {
        $cashier = $this->cashier();
        $admin = $this->admin();
        $this->actingAs($cashier);

        $p = Product::factory()->create(['sale_price' => 100000, 'purchase_price' => 50000, 'current_stock' => 10]);

        $sale = Sale::factory()->for($cashier, 'cashier')->create();
        $this->checkoutProduct($sale, $p, 2); // subtotal 200k
        app(CheckoutSaleService::class)->checkout($sale, 'CASH', 200000, 20000); // discount 20k

        $finance = $this->runFinance(1);
        $summary = $finance['summary'];

        // grand_total = 200k - 20k = 180k
        $this->assertEquals(180000, (float) $summary['revenue']);
        // cogs untouched by discount: 50k * 2 = 100k
        $this->assertEquals(100000, (float) $summary['cogs']);
        // gross profit = 180k - 100k = 80k
        $this->assertEquals(80000, (float) (bcsub((string) $summary['revenue'], (string) $summary['cogs'], 2)));
    }

    public function test_finance_report_respects_date_range_boundaries(): void
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);

        $p = Product::factory()->create(['sale_price' => 10000, 'purchase_price' => 5000, 'current_stock' => 10]);

        // One sale today, one sale 10 days ago.
        $today = Sale::factory()->for($cashier, 'cashier')->create();
        $this->checkoutProduct($today, $p, 1);
        app(CheckoutSaleService::class)->checkout($today, 'CASH', 10000, 0);

        $old = Sale::factory()->for($cashier, 'cashier')->create();
        $this->checkoutProduct($old, $p, 1);
        $old->update(['paid_at' => Carbon::now()->subDays(10)]);

        // Range = last 3 days -> only today's sale counts.
        $finance = $this->runFinance(3);
        $this->assertEquals(10000, (float) $finance['summary']['revenue']);
        $this->assertEquals(5000, (float) $finance['summary']['cogs']);
    }
}
