<?php

namespace App\Http\Controllers\Api;

use App\Exports\ReportSectionsExport;
use App\Http\Controllers\Controller;
use App\Services\Reports\ReportQueryService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Maatwebsite\Excel\Facades\Excel;

class ReportController extends Controller
{
    private const EXPORTABLE_TYPES = ['sales', 'services', 'inventory', 'finance'];

    public function __construct(private ReportQueryService $reports) {}

    private function range(Request $request): array
    {
        $from = Carbon::parse($request->get('from', now()->startOfMonth()->toDateString()));
        // toDateTimeString() (not toDateString()) so the default upper bound
        // stays at 23:59:59 instead of collapsing to midnight, which would
        // silently exclude today's own transactions from the default range.
        $to = Carbon::parse($request->get('to', now()->endOfDay()->toDateTimeString()));
        return [$from, $to];
    }

    public function sales(Request $request)
    {
        [$from, $to] = $this->range($request);
        [$page, $perPage] = $this->pageParams($request);

        return response()->json(['data' => $this->reports->sales($from, $to, $page, $perPage)]);
    }

    public function services(Request $request)
    {
        [$from, $to] = $this->range($request);
        [$page, $perPage] = $this->pageParams($request);

        return response()->json(['data' => $this->reports->services($from, $to, $page, $perPage)]);
    }

    public function inventory(Request $request)
    {
        [$from, $to] = $this->range($request);
        [$page, $perPage] = $this->pageParams($request);

        return response()->json(['data' => $this->reports->inventory($from, $to, $page, $perPage)]);
    }

    public function finance(Request $request)
    {
        [$from, $to] = $this->range($request);
        [$page, $perPage] = $this->pageParams($request);

        return response()->json(['data' => $this->reports->finance($from, $to, $page, $perPage)]);
    }

    private function pageParams(Request $request): array
    {
        $perPage = min(max($request->integer('per_page', 10), 1), 500);
        return [$request->integer('page', 1), $perPage];
    }

    public function export(Request $request, string $type)
    {
        if (!in_array($type, self::EXPORTABLE_TYPES, true)) {
            return response()->json(['message' => 'Jenis laporan tidak valid.'], 422);
        }

        $validated = $request->validate([
            'format' => ['required', 'in:xlsx,pdf'],
        ]);

        [$from, $to] = $this->range($request);
        $report = $this->buildExportSections($type, $from, $to);
        $filename = "laporan-{$type}-{$from->toDateString()}_{$to->toDateString()}";

        if ($validated['format'] === 'pdf') {
            $pdf = Pdf::loadView('exports.report', [
                'title' => $report['title'],
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'sections' => $report['sections'],
            ]);

            return $pdf->download("{$filename}.pdf");
        }

        return Excel::download(
            new ReportSectionsExport($report['sections'], $report['title']),
            "{$filename}.xlsx"
        );
    }

    /**Shape each report's query result into export-ready sections
     * (heading + column headers + rows), reused by both the Excel and PDF
     * renderers. Only business-relevant columns are included (Security.md
     * §A15 — no internal fields exported just because they exist on the model).
     */
    private function buildExportSections(string $type, Carbon $from, Carbon $to): array
    {
        return match ($type) {
            'sales' => $this->salesExportSections($from, $to),
            'services' => $this->servicesExportSections($from, $to),
            'inventory' => $this->inventoryExportSections($from, $to),
            'finance' => $this->financeExportSections($from, $to),
        };
    }

    private function salesExportSections(Carbon $from, Carbon $to): array
    {
        $data = $this->reports->sales($from, $to, null);

        return [
            'title' => 'Laporan Penjualan',
            'sections' => [
                [
                    'heading' => 'Ringkasan',
                    'columns' => ['Metrik', 'Nilai'],
                    'rows' => [
                        ['Jumlah Transaksi', $data['summary']['transactions']],
                        ['Omzet', $data['summary']['revenue']],
                        ['Diskon', $data['summary']['discount']],
                        ['Penjualan Sparepart', $data['summary']['product_sales']],
                        ['Penjualan Jasa', $data['summary']['service_sales']],
                        ['Total Void', $data['summary']['voided']],
                    ],
                ],
                [
                    'heading' => 'Detail Transaksi',
                    'columns' => ['Kode', 'Tanggal', 'Kasir', 'Metode', 'Subtotal', 'Diskon', 'Total', 'Status'],
                    'rows' => collect($data['transactions'])->map(fn ($t) => [
                        $t['sale_code'], $t['paid_at'], $t['cashier'], $t['payment_method'],
                        $t['subtotal'], $t['discount_amount'], $t['grand_total'], $t['status'],
                    ])->all(),
                ],
            ],
        ];
    }

    private function servicesExportSections(Carbon $from, Carbon $to): array
    {
        $data = $this->reports->services($from, $to, null);

        return [
            'title' => 'Laporan Servis',
            'sections' => [
                [
                    'heading' => 'Ringkasan',
                    'columns' => ['Metrik', 'Nilai'],
                    'rows' => [
                        ['Jumlah Order Servis', $data['summary']['total_orders']],
                        ['Pendapatan Jasa', $data['summary']['service_revenue']],
                    ],
                ],
                [
                    'heading' => 'Jasa Terlaris',
                    'columns' => ['Jasa', 'Jumlah', 'Pendapatan'],
                    'rows' => collect($data['top_services'])->map(fn ($s) => [
                        $s['service_name'], $s['count'], $s['total'],
                    ])->all(),
                ],
                [
                    'heading' => 'Daftar Order Servis',
                    'columns' => ['Kode', 'Pelanggan', 'Tipe Motor', 'Status', 'Tanggal Masuk'],
                    'rows' => collect($data['orders'])->map(fn ($o) => [
                        $o['order_code'], $o['customer'], $o['motorcycle_type'], $o['status'], $o['opened_at'],
                    ])->all(),
                ],
            ],
        ];
    }

    private function inventoryExportSections(Carbon $from, Carbon $to): array
    {
        $data = $this->reports->inventory($from, $to, null);

        return [
            'title' => 'Laporan Stok',
            'sections' => [
                [
                    'heading' => 'Ringkasan',
                    'columns' => ['Metrik', 'Nilai'],
                    'rows' => [
                        ['Total Produk Aktif', $data['summary']['total_products']],
                        ['Produk Stok Rendah', $data['summary']['low_stock_count']],
                        ['Nilai Persediaan (harga beli)', $data['summary']['inventory_value']],
                    ],
                ],
                [
                    'heading' => 'Produk Terlaris (periode)',
                    'columns' => ['Produk', 'Jumlah Terjual'],
                    'rows' => collect($data['top_sold'])->map(fn ($p) => [$p['name'], $p['quantity']])->all(),
                ],
                [
                    'heading' => 'Stok Rendah',
                    'columns' => ['SKU', 'Nama', 'Stok', 'Min. Stok', 'Satuan'],
                    'rows' => collect($data['low_stock'])->map(fn ($p) => [
                        $p['sku'], $p['name'], $p['current_stock'], $p['min_stock'], $p['unit'],
                    ])->all(),
                ],
                [
                    'heading' => 'Seluruh Produk Aktif',
                    'columns' => ['SKU', 'Nama', 'Kategori', 'Stok', 'Min. Stok', 'Satuan', 'Harga Jual'],
                    'rows' => collect($data['products'])->map(fn ($p) => [
                        $p['sku'], $p['name'], $p['category'], $p['current_stock'], $p['min_stock'], $p['unit'], $p['sale_price'],
                    ])->all(),
                ],
            ],
        ];
    }

    private function financeExportSections(Carbon $from, Carbon $to): array
    {
        $data = $this->reports->finance($from, $to, null);

        return [
            'title' => 'Laporan Keuangan',
            'sections' => [
                [
                    'heading' => 'Ringkasan',
                    'columns' => ['Metrik', 'Nilai'],
                    'rows' => [
                        ['Penjualan Bersih', $data['summary']['revenue']],
                        ['COGS Produk', $data['summary']['cogs']],
                        ['Pengeluaran', $data['summary']['expenses']],
                        ['Estimasi Hasil Usaha', $data['summary']['estimated_result']],
                    ],
                ],
                [
                    'heading' => 'Detail Pengeluaran',
                    'columns' => ['Tanggal', 'Kategori', 'Jumlah', 'Deskripsi', 'Dicatat Oleh'],
                    'rows' => collect($data['expenses'])->map(fn ($e) => [
                        $e['expense_date'], $e['category'], $e['amount'], $e['description'], $e['created_by'],
                    ])->all(),
                ],
            ],
        ];
    }
}
