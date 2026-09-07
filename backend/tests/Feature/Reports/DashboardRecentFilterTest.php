<?php

namespace Tests\Feature\Reports;

use App\Models\Sale;
use App\Services\Sales\CheckoutSaleService;
use App\Services\Sales\VoidSaleService;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DashboardRecentFilterTest extends TestCase
{
    private function paidSale(int $daysAgo, float $grandTotal): Sale
    {
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        $sale = Sale::factory()->paid()->for($cashier, 'cashier')->create([
            'grand_total' => $grandTotal,
            'subtotal' => $grandTotal,
            'paid_at' => Carbon::now()->subDays($daysAgo),
        ]);
        return $sale;
    }

    public function test_recent_sales_respects_selected_date_range(): void
    {
        $admin = $this->admin();

        // One sale today (in range), one sale 10 days ago (out of range).
        $this->paidSale(0, 50000);
        $this->paidSale(10, 90000);

        // Range = today only (date-only params like the real frontend sends).
        $from = Carbon::now()->startOfDay()->toDateString();
        $to = Carbon::now()->toDateString();

        $response = $this->actingAs($admin)->getJson("/api/v1/dashboard?from={$from}&to={$to}");
        $response->assertStatus(200);

        $sales = $response->json('data.recent_sales');
        $this->assertCount(1, $sales);
        $this->assertEquals(50000, (float) $sales[0]['grand_total']);

        // Range = last 30 days -> both sales included.
        $wideFrom = Carbon::now()->subDays(30)->startOfDay()->toDateString();
        $response = $this->actingAs($admin)->getJson("/api/v1/dashboard?from={$wideFrom}&to={$to}");
        $wideSales = $response->json('data.recent_sales');
        $this->assertCount(2, $wideSales);
    }

    public function test_recent_voids_respects_selected_date_range(): void
    {
        $admin = $this->admin();
        $cashier = $this->cashier();

        // Today's sale, voided today (in range).
        $this->actingAs($cashier);
        $todaySale = Sale::factory()->paid()->for($cashier, 'cashier')->create(['grand_total' => 10000, 'subtotal' => 10000]);
        $this->actingAs($admin);
        app(VoidSaleService::class)->void($todaySale, 'Batal hari ini');

        // Old sale, voided 10 days ago (out of range).
        $old = Sale::factory()->paid()->for($cashier, 'cashier')->create([
            'grand_total' => 70000,
            'subtotal' => 70000,
            'paid_at' => Carbon::now()->subDays(10),
        ]);
        $old->update([
            'status' => Sale::STATUS_VOID,
            'voided_at' => Carbon::now()->subDays(10),
            'void_reason' => 'Batal lama',
        ]);

        $from = Carbon::now()->startOfDay()->toDateString();
        $to = Carbon::now()->toDateString();

        $response = $this->actingAs($admin)->getJson("/api/v1/dashboard?from={$from}&to={$to}");
        $response->assertStatus(200);

        $voids = $response->json('data.recent_voids');
        $this->assertCount(1, $voids);
        $this->assertEquals(10000, (float) $voids[0]['grand_total']);
    }

    public function test_date_only_to_still_includes_sales_made_later_the_same_day(): void
    {
        $admin = $this->admin();

        // Sale paid "later" today (e.g. 14:00) must count when to = today (date-only).
        $cashier = $this->cashier();
        $this->actingAs($cashier);
        Sale::factory()->paid()->for($cashier, 'cashier')->create([
            'grand_total' => 42000,
            'subtotal' => 42000,
            'paid_at' => Carbon::now()->startOfDay()->addHours(14),
        ]);

        $from = Carbon::now()->startOfDay()->toDateString();
        $to = Carbon::now()->toDateString();

        $response = $this->actingAs($admin)->getJson("/api/v1/dashboard?from={$from}&to={$to}");
        $response->assertStatus(200);

        $sales = $response->json('data.recent_sales');
        $this->assertCount(1, $sales);
        $this->assertEquals(42000, (float) $sales[0]['grand_total']);
    }
}