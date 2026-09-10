<?php

namespace Tests\Feature\Reports;

use App\Models\Product;
use Tests\TestCase;

class ReportsAndDashboardTest extends TestCase
{
    public function test_cashier_cannot_access_dashboard_or_any_report(): void
    {
        $cashier = $this->cashier();

        $this->actingAs($cashier)->getJson('/api/v1/dashboard')->assertStatus(403);
        $this->actingAs($cashier)->getJson('/api/v1/reports/sales')->assertStatus(403);
        $this->actingAs($cashier)->getJson('/api/v1/reports/services')->assertStatus(403);
        $this->actingAs($cashier)->getJson('/api/v1/reports/inventory')->assertStatus(403);
        $this->actingAs($cashier)->getJson('/api/v1/reports/finance')->assertStatus(403);
    }

    public function test_admin_can_access_dashboard_and_reports(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->getJson('/api/v1/dashboard')->assertStatus(200);
        $this->actingAs($admin)->getJson('/api/v1/reports/sales')->assertStatus(200);
        $this->actingAs($admin)->getJson('/api/v1/reports/services')->assertStatus(200);
        $this->actingAs($admin)->getJson('/api/v1/reports/inventory')->assertStatus(200);
        $this->actingAs($admin)->getJson('/api/v1/reports/finance')->assertStatus(200);
    }

    public function test_dashboard_revenue_matches_sales_report_revenue_for_same_period(): void
    {
        $admin = $this->admin();
        $cashier = $this->cashier();
        $product = Product::factory()->create(['sale_price' => 40000, 'current_stock' => 10]);

        $saleId = $this->actingAs($cashier)->postJson('/api/v1/sales', [
            'items' => [['item_type' => 'PRODUCT', 'product_id' => $product->id, 'quantity' => 1]],
        ])->json('data.id');
        $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/checkout", ['payment_method' => 'CASH', 'paid_amount' => 50000]);

        // Both endpoints default to the current month (start of month -> now)
        // when no from/to is given, so month_revenue and the report's period
        // revenue should match under default params.
        $dashboard = $this->actingAs($admin)->getJson('/api/v1/dashboard')->json('data.kpi');
        $salesReport = $this->actingAs($admin)->getJson('/api/v1/reports/sales')->json('data.summary');

        $this->assertEquals($dashboard['month_revenue'], $salesReport['revenue']);
    }

    public function test_dashboard_response_matches_the_frontend_contract_shape(): void
    {
        // Regression: DashboardController used to return field names
        // (summary/revenue_chart/...) that didn't match what
        // frontend/src/types/index.ts's DashboardData expects
        // (kpi/revenue_series/revenue_breakdown/recent_sales/...), crashing
        // DashboardPage.tsx on first render after login. Pin the exact shape.
        $admin = $this->admin();
        $cashier = $this->cashier();
        $product = Product::factory()->create(['sale_price' => 40000, 'purchase_price' => 25000, 'current_stock' => 10]);

        $saleId = $this->actingAs($cashier)->postJson('/api/v1/sales', [
            'items' => [['item_type' => 'PRODUCT', 'product_id' => $product->id, 'quantity' => 1]],
        ])->json('data.id');
        $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/checkout", ['payment_method' => 'CASH', 'paid_amount' => 50000]);

        $response = $this->actingAs($admin)->getJson('/api/v1/dashboard');
        $response->assertStatus(200);
        $data = $response->json('data');

        foreach ([
            'kpi', 'revenue_series', 'revenue_breakdown',
            'top_products', 'top_services', 'low_stock', 'recent_sales', 'recent_voids',
        ] as $key) {
            $this->assertArrayHasKey($key, $data, "dashboard response missing top-level key '{$key}'");
        }

        foreach ([
            'today_revenue', 'today_transactions', 'today_service_orders', 'today_expenses',
            'month_revenue', 'month_expenses', 'estimated_result', 'low_stock_count', 'void_count_today',
        ] as $key) {
            $this->assertArrayHasKey($key, $data['kpi'], "dashboard kpi missing key '{$key}'");
        }

        $this->assertArrayHasKey('products', $data['revenue_breakdown']);
        $this->assertArrayHasKey('services', $data['revenue_breakdown']);

        $this->assertNotEmpty($data['recent_sales']);
        foreach (['id', 'sale_code', 'status', 'grand_total', 'paid_at', 'cashier'] as $key) {
            $this->assertArrayHasKey($key, $data['recent_sales'][0], "recent_sales item missing key '{$key}'");
        }

        $this->assertNotEmpty($data['top_products']);
        foreach (['product_id', 'name', 'total_qty', 'total_revenue'] as $key) {
            $this->assertArrayHasKey($key, $data['top_products'][0], "top_products item missing key '{$key}'");
        }
    }

    public function test_default_date_range_includes_a_sale_made_later_today(): void
    {
        // Regression: ReportController/DashboardController defaulted the
        // upper bound via now()->endOfDay()->toDateString(), which discards
        // the time-of-day and collapses "to" back to today 00:00:00 instead
        // of 23:59:59. Any sale paid later today (i.e. almost always) was
        // silently excluded from every default-range report/dashboard call.
        $admin = $this->admin();
        $cashier = $this->cashier();
        $product = Product::factory()->create(['sale_price' => 77000, 'purchase_price' => 20000, 'current_stock' => 10]);

        $saleId = $this->actingAs($cashier)->postJson('/api/v1/sales', [
            'items' => [['item_type' => 'PRODUCT', 'product_id' => $product->id, 'quantity' => 1]],
        ])->json('data.id');
        $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/checkout", ['payment_method' => 'CASH', 'paid_amount' => 50000]);

        $salesReport = $this->actingAs($admin)->getJson('/api/v1/reports/sales');
        $salesReport->assertStatus(200);
        $this->assertEquals(1, $salesReport->json('data.summary.transactions'));
        $this->assertEquals(77000, (float) $salesReport->json('data.summary.revenue'));

        // estimated_result = revenue(77000) - cogs(20000 purchase_price * 1) - expenses(0) = 57000
        $dashboard = $this->actingAs($admin)->getJson('/api/v1/dashboard');
        $this->assertEquals(57000, (float) $dashboard->json('data.kpi.estimated_result'));
    }

    public function test_low_stock_products_are_visible_only_to_admin(): void
    {
        $admin = $this->admin();
        $cashier = $this->cashier();
        Product::factory()->lowStock()->create();

        $adminDashboard = $this->actingAs($admin)->getJson('/api/v1/dashboard');
        $adminDashboard->assertStatus(200);
        $this->assertNotEmpty($adminDashboard->json('data.low_stock'));

        $this->actingAs($cashier)->getJson('/api/v1/dashboard')->assertStatus(403);
    }

    public function test_explicit_to_date_still_includes_sales_made_later_that_day(): void
    {
        // Regression: ReportController::range() parsed a date-only "to"
        // (YYYY-MM-DD, exactly what the frontend sends) to midnight, so every
        // whereBetween(..., $to) silently dropped all transactions made later
        // on the "to" day. The upper bound must be normalized to end-of-day.
        $admin = $this->admin();
        $cashier = $this->cashier();
        $product = Product::factory()->create(['sale_price' => 50000, 'purchase_price' => 20000, 'current_stock' => 10]);

        $saleId = $this->actingAs($cashier)->postJson('/api/v1/sales', [
            'items' => [['item_type' => 'PRODUCT', 'product_id' => $product->id, 'quantity' => 1]],
        ])->json('data.id');
        $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/checkout", ['payment_method' => 'CASH', 'paid_amount' => 50000]);

        $today = now()->toDateString();
        $response = $this->actingAs($admin)->getJson("/api/v1/reports/sales?from={$today}&to={$today}");
        $response->assertStatus(200);
        $this->assertEquals(1, $response->json('data.summary.transactions'));
        $this->assertEquals(50000, (float) $response->json('data.summary.revenue'));
        $this->assertCount(1, $response->json('data.transactions'));
    }
}
