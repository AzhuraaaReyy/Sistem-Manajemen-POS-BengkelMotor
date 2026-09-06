<?php

namespace App\Services\Reports;

use App\Models\Expense;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\ServiceOrder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardQueryService
{
    /**Build the admin dashboard KPI block for a given period.
     * `estimated_result` uses the selected period ($from/$to) and must stay in
     * sync with ReportQueryService::finance()'s formula for the same period.
     * `month_*` figures are always the current calendar month, independent of
     * the selected period, matching PRD "omzet/pengeluaran bulan berjalan".
     */
    public function kpi(Carbon $from, Carbon $to): array
    {
        $periodRevenue = $this->periodRevenue($from, $to);
        $periodCogs = $this->productCogs($from, $to);
        $periodExpenses = $this->periodExpenses($from, $to);
        $estimatedResult = bcsub(bcsub((string) $periodRevenue, (string) $periodCogs, 2), (string) $periodExpenses, 2);

        $monthStart = now()->startOfMonth();
        $now = now();
        $monthRevenue = Sale::where('status', Sale::STATUS_PAID)
            ->whereBetween('paid_at', [$monthStart, $now])
            ->sum('grand_total');
        $monthExpenses = Expense::whereBetween(DB::raw('DATE(expense_date)'), [$monthStart->toDateString(), $now->toDateString()])
            ->sum('amount');

        return [
            // New period-based fields (primary)
            'period_revenue' => $periodRevenue,
            'period_transactions' => $this->periodTransactions($from, $to),
            'period_service_orders' => $this->periodServiceOrders($from, $to),
            'period_expenses' => $periodExpenses,
            'period_revenue_vs_prev_pct' => $this->periodVsPrevious($from, $to, 'revenue'),
            'period_transactions_vs_prev_pct' => $this->periodVsPrevious($from, $to, 'transactions'),
            'period_service_orders_vs_prev_pct' => $this->periodVsPrevious($from, $to, 'service_orders'),
            'period_expenses_vs_prev_pct' => $this->periodVsPrevious($from, $to, 'expenses'),

            // Estimated result follows the selected period
            'estimated_result' => $estimatedResult,

            // Month figures (current calendar month, independent of filter)
            'month_revenue' => $monthRevenue,
            'month_expenses' => $monthExpenses,

            // Real-time fields (not date-filtered)
            'low_stock_count' => Product::where('is_active', true)->whereColumn('current_stock', '<=', 'min_stock')->count(),
            'void_count_today' => Sale::where('status', Sale::STATUS_VOID)->whereDate('voided_at', today())->count(),

            // Backward compatibility aliases (old field names)
            'today_revenue' => $periodRevenue,
            'today_transactions' => $this->periodTransactions($from, $to),
            'today_service_orders' => $this->periodServiceOrders($from, $to),
            'today_expenses' => $periodExpenses,
            'today_revenue_vs_yesterday_pct' => $this->periodVsPrevious($from, $to, 'revenue'),
            'today_transactions_vs_yesterday_pct' => $this->periodVsPrevious($from, $to, 'transactions'),
            'today_service_orders_vs_yesterday_pct' => $this->periodVsPrevious($from, $to, 'service_orders'),
            'today_expenses_vs_yesterday_pct' => $this->periodVsPrevious($from, $to, 'expenses'),
            'low_stock_count_vs_yesterday_pct' => $this->lowStockCountVsYesterday(),
            'void_count_today_vs_yesterday_pct' => $this->voidCountTodayVsYesterday(),
        ];
    }

    public function revenueChart(Carbon $from, Carbon $to): array
    {
        $rows = Sale::where('status', Sale::STATUS_PAID)
            ->whereBetween('paid_at', [$from, $to])
            ->selectRaw('DATE(paid_at) as day, SUM(grand_total) as total')
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        return $rows->map(fn ($r) => [
            'date' => $r->day,
            'revenue' => (float) $r->total,
        ])->values()->toArray();
    }

    public function revenueBreakdown(Carbon $from, Carbon $to): array
    {
        $products = SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', Sale::STATUS_PAID)
            ->where('sale_items.item_type', SaleItem::TYPE_PRODUCT)
            ->whereBetween('sales.paid_at', [$from, $to])
            ->sum('sale_items.subtotal');

        $services = SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', Sale::STATUS_PAID)
            ->where('sale_items.item_type', SaleItem::TYPE_SERVICE)
            ->whereBetween('sales.paid_at', [$from, $to])
            ->sum('sale_items.subtotal');

        // Compare with previous period of same duration
        $prevPeriod = $this->getPreviousPeriod($from, $to);
        $yesterdayProducts = SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', Sale::STATUS_PAID)
            ->where('sale_items.item_type', SaleItem::TYPE_PRODUCT)
            ->whereBetween('sales.paid_at', [$prevPeriod['from'], $prevPeriod['to']])
            ->sum('sale_items.subtotal');

        $yesterdayServices = SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', Sale::STATUS_PAID)
            ->where('sale_items.item_type', SaleItem::TYPE_SERVICE)
            ->whereBetween('sales.paid_at', [$prevPeriod['from'], $prevPeriod['to']])
            ->sum('sale_items.subtotal');

        return [
            'products' => (float) $products,
            'services' => (float) $services,
            // New field names (primary)
            'products_vs_prev_pct' => $this->calculatePctChange((float) $products, (float) $yesterdayProducts),
            'services_vs_prev_pct' => $this->calculatePctChange((float) $services, (float) $yesterdayServices),
            // Backward compatibility aliases
            'products_vs_yesterday_pct' => $this->calculatePctChange((float) $products, (float) $yesterdayProducts),
            'services_vs_yesterday_pct' => $this->calculatePctChange((float) $services, (float) $yesterdayServices),
        ];
    }

    public function topProducts(Carbon $from, Carbon $to, int $limit = 5): array
    {
        return SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', Sale::STATUS_PAID)
            ->where('sale_items.item_type', SaleItem::TYPE_PRODUCT)
            ->whereBetween('sales.paid_at', [$from, $to])
            ->selectRaw('sale_items.product_id, sale_items.item_name_snapshot, SUM(sale_items.quantity) as qty, SUM(sale_items.subtotal) as total')
            ->groupBy('sale_items.product_id', 'sale_items.item_name_snapshot')
            ->orderByDesc('qty')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => [
                'product_id' => $r->product_id,
                'name' => $r->item_name_snapshot,
                'total_qty' => (float) $r->qty,
                'total_revenue' => (float) $r->total,
            ])
            ->values()
            ->toArray();
    }

    public function topServices(Carbon $from, Carbon $to, int $limit = 5): array
    {
        return SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', Sale::STATUS_PAID)
            ->where('sale_items.item_type', SaleItem::TYPE_SERVICE)
            ->whereBetween('sales.paid_at', [$from, $to])
            ->selectRaw('sale_items.service_id, sale_items.item_name_snapshot, SUM(sale_items.quantity) as qty, SUM(sale_items.subtotal) as total')
            ->groupBy('sale_items.service_id', 'sale_items.item_name_snapshot')
            ->orderByDesc('qty')
            ->limit($limit)
            ->get()
            ->map(fn ($r) => [
                'service_id' => $r->service_id,
                'name' => $r->item_name_snapshot,
                'total_qty' => (float) $r->qty,
                'total_revenue' => (float) $r->total,
            ])
            ->values()
            ->toArray();
    }

    public function lowStock(int $limit = 5): array
    {
        return Product::where('is_active', true)
            ->whereColumn('current_stock', '<=', 'min_stock')
            ->orderBy('current_stock')
            ->limit($limit)
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'sku' => $p->sku,
                'name' => $p->name,
                'current_stock' => $p->current_stock,
                'min_stock' => $p->min_stock,
                'unit' => $p->unit,
            ])
            ->values()
            ->toArray();
    }

    public function recentSales(int $limit = 5): array
    {
        return Sale::with('cashier:id,name')
            ->where('status', Sale::STATUS_PAID)
            ->orderByDesc('paid_at')
            ->limit($limit)
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'sale_code' => $s->sale_code,
                'status' => $s->status,
                'grand_total' => $s->grand_total,
                'payment_method' => $s->payment_method,
                'paid_at' => $s->paid_at,
                'cashier' => $s->cashier ? ['id' => $s->cashier->id, 'name' => $s->cashier->name] : null,
            ])
            ->values()
            ->toArray();
    }

    public function recentVoids(int $limit = 5): array
    {
        return Sale::with('cashier:id,name')
            ->where('status', Sale::STATUS_VOID)
            ->orderByDesc('voided_at')
            ->limit($limit)
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'sale_code' => $s->sale_code,
                'status' => $s->status,
                'grand_total' => $s->grand_total,
                'void_reason' => $s->void_reason,
                'voided_at' => $s->voided_at,
                'cashier' => $s->cashier ? ['id' => $s->cashier->id, 'name' => $s->cashier->name] : null,
            ])
            ->values()
            ->toArray();
    }

    private function productCogs(Carbon $from, Carbon $to): string
    {
        return SaleItem::join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.status', Sale::STATUS_PAID)
            ->where('sale_items.item_type', SaleItem::TYPE_PRODUCT)
            ->whereBetween('sales.paid_at', [$from, $to])
            ->selectRaw('COALESCE(SUM(sale_items.purchase_price_snapshot * sale_items.quantity), 0) as cogs')
            ->value('cogs') ?? '0';
    }

    // New period-based methods (use $from/$to parameters)
    private function periodRevenue(Carbon $from, Carbon $to): float
    {
        return (float) Sale::where('status', Sale::STATUS_PAID)
            ->whereBetween('paid_at', [$from, $to])
            ->sum('grand_total');
    }

    private function periodExpenses(Carbon $from, Carbon $to): float
    {
        return (float) Expense::whereBetween(DB::raw('DATE(expense_date)'), [$from->toDateString(), $to->toDateString()])
            ->sum('amount');
    }

    private function periodTransactions(Carbon $from, Carbon $to): int
    {
        return Sale::where('status', Sale::STATUS_PAID)
            ->whereBetween('paid_at', [$from, $to])
            ->count();
    }

    private function periodServiceOrders(Carbon $from, Carbon $to): int
    {
        return ServiceOrder::whereBetween('opened_at', [$from, $to])
            ->count();
    }

    // Get previous period of same duration for comparison
    private function getPreviousPeriod(Carbon $from, Carbon $to): array
    {
        $days = $from->diffInDays($to) + 1;
        $prevTo = $from->copy()->subDay();
        $prevFrom = $prevTo->copy()->subDays($days - 1);
        
        return [
            'from' => $prevFrom->startOfDay(),
            'to' => $prevTo->endOfDay(),
        ];
    }

    // Compare current period vs previous period of same duration
    private function periodVsPrevious(Carbon $from, Carbon $to, string $type): float
    {
        $prevPeriod = $this->getPreviousPeriod($from, $to);
        
        $current = match($type) {
            'revenue' => $this->periodRevenue($from, $to),
            'transactions' => $this->periodTransactions($from, $to),
            'service_orders' => $this->periodServiceOrders($from, $to),
            'expenses' => $this->periodExpenses($from, $to),
            default => 0,
        };
        
        $previous = match($type) {
            'revenue' => $this->periodRevenue($prevPeriod['from'], $prevPeriod['to']),
            'transactions' => $this->periodTransactions($prevPeriod['from'], $prevPeriod['to']),
            'service_orders' => $this->periodServiceOrders($prevPeriod['from'], $prevPeriod['to']),
            'expenses' => $this->periodExpenses($prevPeriod['from'], $prevPeriod['to']),
            default => 0,
        };
        
        return $this->calculatePctChange($current, $previous);
    }

    private function calculatePctChange(float $current, float $previous): float
    {
        if ($previous == 0) {
            return $current > 0 ? 100.0 : 0.0;
        }
        return round((($current - $previous) / $previous) * 100, 1);
    }

    // Legacy methods (kept for backward compatibility in aliases)
    private function todayRevenue(): float
    {
        return (float) Sale::where('status', Sale::STATUS_PAID)
            ->whereDate('paid_at', today())
            ->sum('grand_total');
    }

    private function todayExpenses(): float
    {
        return (float) Expense::whereDate('expense_date', today())->sum('amount');
    }

    private function todayTransactions(): int
    {
        return Sale::where('status', Sale::STATUS_PAID)->whereDate('paid_at', today())->count();
    }

    private function todayServiceOrders(): int
    {
        return ServiceOrder::whereDate('opened_at', today())->count();
    }

    private function todayRevenueVsYesterday(): float
    {
        $today = $this->todayRevenue();
        $yesterday = (float) Sale::where('status', Sale::STATUS_PAID)
            ->whereDate('paid_at', today()->subDay())
            ->sum('grand_total');
        return $this->calculatePctChange($today, $yesterday);
    }

    private function todayTransactionsVsYesterday(): float
    {
        $today = $this->todayTransactions();
        $yesterday = Sale::where('status', Sale::STATUS_PAID)
            ->whereDate('paid_at', today()->subDay())
            ->count();
        return $this->calculatePctChange((float) $today, (float) $yesterday);
    }

    private function todayServiceOrdersVsYesterday(): float
    {
        $today = $this->todayServiceOrders();
        $yesterday = ServiceOrder::whereDate('opened_at', today()->subDay())->count();
        return $this->calculatePctChange((float) $today, (float) $yesterday);
    }

    private function todayExpensesVsYesterday(): float
    {
        $today = $this->todayExpenses();
        $yesterday = (float) Expense::whereDate('expense_date', today()->subDay())->sum('amount');
        return $this->calculatePctChange($today, $yesterday);
    }

    private function lowStockCountVsYesterday(): float
    {
        $today = Product::where('is_active', true)->whereColumn('current_stock', '<=', 'min_stock')->count();
        $yesterday = Product::where('is_active', true)
            ->where(function ($q) {
                $q->where('current_stock', '<=', DB::raw('min_stock'));
            })
            ->whereDate('updated_at', today()->subDay())
            ->count();
        
        if ($yesterday == 0) {
            $yesterday = Product::where('is_active', true)
                ->whereColumn('current_stock', '<=', 'min_stock')
                ->whereDate('updated_at', today()->subDay())
                ->count();
        }
        
        if ($yesterday == 0) {
            return 0.0;
        }
        
        return $this->calculatePctChange((float) $today, (float) $yesterday);
    }

    private function voidCountTodayVsYesterday(): float
    {
        $today = Sale::where('status', Sale::STATUS_VOID)->whereDate('voided_at', today())->count();
        $yesterday = Sale::where('status', Sale::STATUS_VOID)->whereDate('voided_at', today()->subDay())->count();
        return $this->calculatePctChange((float) $today, (float) $yesterday);
    }
}