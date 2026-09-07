<?php

namespace Tests\Feature\Reports;

use App\Models\Expense;
use App\Models\Product;
use App\Models\Sale;
use App\Models\ServiceOrder;
use Tests\TestCase;

class ReportPaginationTest extends TestCase
{
    public function test_sales_report_paginates_transactions_defaulting_to_ten_per_page(): void
    {
        $admin = $this->admin();

        for ($i = 0; $i < 15; $i++) {
            Sale::factory()->paid()->create(['grand_total' => 10000, 'subtotal' => 10000]);
        }

        $page1 = $this->actingAs($admin)->getJson('/api/v1/reports/sales?page=1');
        $page1->assertStatus(200);

        $this->assertCount(10, $page1->json('data.transactions'));
        $this->assertSame(15, $page1->json('data.transactions_pagination.total'));
        $this->assertSame(1, $page1->json('data.transactions_pagination.current_page'));
        $this->assertSame(2, $page1->json('data.transactions_pagination.last_page'));
        $this->assertSame(10, $page1->json('data.transactions_pagination.per_page'));

        // Summary aggregates must stay computed over the full range, not the page.
        $this->assertSame(15, $page1->json('data.summary.transactions'));
        $this->assertEquals(150000, $page1->json('data.summary.revenue'));
    }

    public function test_sales_report_second_page_returns_remaining_rows(): void
    {
        $admin = $this->admin();

        for ($i = 0; $i < 15; $i++) {
            Sale::factory()->paid()->create(['grand_total' => 10000, 'subtotal' => 10000]);
        }

        $page2 = $this->actingAs($admin)->getJson('/api/v1/reports/sales?page=2');
        $page2->assertStatus(200);

        $this->assertCount(5, $page2->json('data.transactions'));
        $this->assertSame(2, $page2->json('data.transactions_pagination.current_page'));
        $this->assertSame(15, $page2->json('data.summary.transactions'));
    }

    public function test_finance_report_paginates_expenses(): void
    {
        $admin = $this->admin();

        Expense::factory()->count(12)->create(['amount' => 5000]);

        $page1 = $this->actingAs($admin)->getJson('/api/v1/reports/finance?page=1');
        $page1->assertStatus(200);

        $this->assertCount(10, $page1->json('data.expenses'));
        $this->assertSame(12, $page1->json('data.expenses_pagination.total'));
        $this->assertSame(2, $page1->json('data.expenses_pagination.last_page'));
        $this->assertEquals(60000, $page1->json('data.summary.expenses'));

        $page2 = $this->actingAs($admin)->getJson('/api/v1/reports/finance?page=2');
        $this->assertCount(2, $page2->json('data.expenses'));
        $this->assertSame(2, $page2->json('data.expenses_pagination.current_page'));
    }

    public function test_per_page_is_clamped_to_five_hundred(): void
    {
        $admin = $this->admin();

        for ($i = 0; $i < 3; $i++) {
            Sale::factory()->paid()->create();
        }

        $response = $this->actingAs($admin)->getJson('/api/v1/reports/sales?per_page=999');
        $response->assertStatus(200);

        $this->assertSame(500, $response->json('data.transactions_pagination.per_page'));
    }

    public function test_sales_pagination_respects_date_range(): void
    {
        $admin = $this->admin();

        Sale::factory()->paid()->create(['paid_at' => now()->subMonth()]);
        Sale::factory()->paid()->count(3)->create();

        $response = $this->actingAs($admin)->getJson('/api/v1/reports/sales?page=1&per_page=10');
        $response->assertStatus(200);

        $this->assertCount(3, $response->json('data.transactions'));
        $this->assertSame(3, $response->json('data.transactions_pagination.total'));
    }

    public function test_report_pagination_does_not_require_auth_role(): void
    {
        $cashier = $this->cashier();

        $this->actingAs($cashier)->getJson('/api/v1/reports/sales?page=1')->assertStatus(403);
    }

    public function test_services_report_paginates_orders_while_summary_stays_full_range(): void
    {
        $admin = $this->admin();

        ServiceOrder::factory()->count(15)->create();

        $page1 = $this->actingAs($admin)->getJson('/api/v1/reports/services?page=1');
        $page1->assertStatus(200);

        $this->assertCount(10, $page1->json('data.orders'));
        $this->assertSame(15, $page1->json('data.orders_pagination.total'));
        $this->assertSame(1, $page1->json('data.orders_pagination.current_page'));
        $this->assertSame(2, $page1->json('data.orders_pagination.last_page'));
        $this->assertSame(15, $page1->json('data.summary.total_orders'));

        $page2 = $this->actingAs($admin)->getJson('/api/v1/reports/services?page=2');
        $this->assertCount(5, $page2->json('data.orders'));
        $this->assertSame(2, $page2->json('data.orders_pagination.current_page'));
        $this->assertSame(15, $page2->json('data.summary.total_orders'));
    }

    public function test_services_by_status_count_covers_whole_period_not_current_page(): void
    {
        $admin = $this->admin();

        ServiceOrder::factory()->count(10)->create(['status' => ServiceOrder::STATUS_OPEN]);
        ServiceOrder::factory()->count(10)->create(['status' => ServiceOrder::STATUS_DONE]);

        $response = $this->actingAs($admin)->getJson('/api/v1/reports/services?page=2');

        $byStatus = $response->json('data.summary.by_status');
        $this->assertSame(10, $byStatus[ServiceOrder::STATUS_OPEN]);
        $this->assertSame(10, $byStatus[ServiceOrder::STATUS_DONE]);
        $this->assertSame(20, $response->json('data.summary.total_orders'));
    }

    public function test_inventory_report_paginates_low_stock_while_summary_stays_full_range(): void
    {
        $admin = $this->admin();

        Product::factory()->lowStock()->count(12)->create();
        Product::factory()->count(5)->create();

        $page1 = $this->actingAs($admin)->getJson('/api/v1/reports/inventory?page=1');
        $page1->assertStatus(200);

        $this->assertCount(10, $page1->json('data.low_stock'));
        $this->assertSame(12, $page1->json('data.low_stock_pagination.total'));
        $this->assertSame(2, $page1->json('data.low_stock_pagination.last_page'));
        $this->assertSame(12, $page1->json('data.summary.low_stock_count'));
        $this->assertSame(17, $page1->json('data.summary.total_products'));

        $page2 = $this->actingAs($admin)->getJson('/api/v1/reports/inventory?page=2');
        $this->assertCount(2, $page2->json('data.low_stock'));
        $this->assertSame(2, $page2->json('data.low_stock_pagination.current_page'));
        $this->assertSame(12, $page2->json('data.summary.low_stock_count'));
    }
}