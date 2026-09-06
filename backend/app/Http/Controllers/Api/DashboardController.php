<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Reports\DashboardQueryService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function __construct(private DashboardQueryService $dashboard) {}

    public function index(Request $request)
    {
        $request->validate([
            'from' => 'nullable|date|before_or_equal:today',
            'to' => 'nullable|date|after_or_equal:from|before_or_equal:today',
        ]);

        // Default to today (not start of month) so dashboard shows today's data by default
        $from = Carbon::parse($request->get('from', now()->startOfDay()->toDateString()));
        // toDateTimeString() keeps 23:59:59 to include today's transactions
        $to = Carbon::parse($request->get('to', now()->endOfDay()->toDateTimeString()));

        return response()->json([
            'data' => [
                'kpi' => $this->dashboard->kpi($from, $to),
                'revenue_series' => $this->dashboard->revenueChart($from, $to),
                'revenue_breakdown' => $this->dashboard->revenueBreakdown($from, $to),
                'top_products' => $this->dashboard->topProducts($from, $to),
                'top_services' => $this->dashboard->topServices($from, $to),
                'low_stock' => $this->dashboard->lowStock(),
                'recent_sales' => $this->dashboard->recentSales(),
                'recent_voids' => $this->dashboard->recentVoids(),
            ],
        ]);
    }
}