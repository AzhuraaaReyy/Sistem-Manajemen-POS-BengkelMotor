import { useCallback, useEffect, useState } from "react";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import {
  getSalesReportApi,
  getServiceReportApi,
  getInventoryReportApi,
  getFinanceReportApi,
  exportReportApi,
  type ExportFormat,
} from "@/lib/api/reports";
import { formatRupiah, formatNumber, formatDateTime } from "@/lib/formatters";

type TabKey = "sales" | "services" | "inventory" | "finance";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

type AnyRow = Record<string, any>;
const REPORT_PAGE_SIZE = 10;

function PagedTable<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
}: {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (r: T) => string | number;
}) {
  const [page, setPage] = useState(1);
  const lastPage = Math.max(1, Math.ceil(data.length / REPORT_PAGE_SIZE));
  const safePage = Math.min(page, lastPage);
  
  const rawRows = data.slice((safePage - 1) * REPORT_PAGE_SIZE, safePage * REPORT_PAGE_SIZE);
  const rows = rawRows.map((item, idx) => ({
    ...item,
    _no: (safePage - 1) * REPORT_PAGE_SIZE + idx + 1,
  }));

  return (
    <div>
      <DataTable columns={columns} data={rows} keyExtractor={keyExtractor} />
      <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
        <span className="text-xs text-slate-500">
          Menampilkan {rows.length} dari {data.length} data
        </span>
        <Pagination
          currentPage={safePage}
          lastPage={lastPage}
          total={data.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}

export function ReportsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("sales");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("xlsx");
  const [exporting, setExporting] = useState(false);

  const [sales, setSales] = useState<AnyRow | null>(null);
  const [services, setServices] = useState<AnyRow | null>(null);
  const [inventory, setInventory] = useState<AnyRow | null>(null);
  const [finance, setFinance] = useState<AnyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "sales") setSales(await getSalesReportApi({ from, to }));
      else if (tab === "services") setServices(await getServiceReportApi({ from, to }));
      else if (tab === "inventory") setInventory(await getInventoryReportApi({ from, to }));
      else if (tab === "finance") setFinance(await getFinanceReportApi({ from, to }));
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Gagal memuat laporan.");
    } finally {
      setLoading(false);
    }
  }, [tab, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await exportReportApi(tab, { from, to }, exportFormat);
      const mime =
        exportFormat === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-${tab}-${from}-${to}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Laporan diekspor.");
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message || "Gagal mengekspor.");
    } finally {
      setExporting(false);
    }
  };

  const TABS = [
    { value: "sales", label: "Ringkasan", icon: <TrendingIcon /> },
    { value: "services", label: "Transaksi", icon: <ListIcon /> },
    { value: "inventory", label: "Penjualan", icon: <CartIcon /> },
    { value: "finance", label: "Pengeluaran", icon: <MoneyIcon /> },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB] p-6 font-sans">
      {/* Header Section */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Laporan</h1>
            <p className="text-sm text-slate-500">Analisis dan evaluasi perkembangan bengkel</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              className="appearance-none rounded-lg border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            >
              <option value="xlsx">Export Excel</option>
              <option value="pdf">Export PDF</option>
            </select>
            <DownloadIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          <button className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <CalendarIcon />
            31 Agu 2026 - 05 Sep 2026
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex w-fit items-center gap-1 rounded-full bg-blue-50/50 p-1 border border-blue-100/60">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value as TabKey)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all ${
              tab === t.value
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === "sales" ? (
        <SalesReportView data={sales} />
      ) : tab === "services" ? (
        <ServicesReportView data={services} />
      ) : tab === "inventory" ? (
        <InventoryReportView data={inventory} />
      ) : (
        <FinanceReportView data={finance} />
      )}
    </div>
  );
}

function SalesReportView({ data }: { data: AnyRow | null }) {
  if (!data) return null;
  const summary = data.summary || {};
  const paymentMethods: AnyRow[] = data.payment_methods || [];
  const transactions: AnyRow[] = data.transactions || [];

  return (
    <div className="space-y-6">
      {/* Filters Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">
            Hari Ini
          </button>
          <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm">
            7 Hari
          </button>
          <button className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200">
            30 Hari
          </button>
          <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <CalendarIcon className="h-4 w-4" />
            Custom
          </button>
        </div>
        <select className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none">
          <option>Semua Metode Pembayaran</option>
        </select>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <DashboardCard
          title="Jumlah Transaksi"
          value={formatNumber(summary.transactions)}
          trend="+ 12%"
          trendLabel="vs periode sebelumnya"
          icon={<ReceiptIcon className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          trendColor="text-emerald-500"
        />
        <DashboardCard
          title="Omzet"
          value={formatRupiah(summary.revenue)}
          trend="+ 18%"
          trendLabel="vs periode sebelumnya"
          icon={<MoneyIcon className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          trendColor="text-emerald-500"
        />
        <DashboardCard
          title="Diskon"
          value={formatRupiah(summary.discount)}
          trend="-"
          trendLabel="vs periode sebelumnya"
          icon={<MinusIcon className="h-5 w-5 text-red-600" />}
          iconBg="bg-red-50"
          trendColor="text-slate-400"
        />
        <DashboardCard
          title="Total Void"
          value={formatRupiah(summary.voided)}
          trend="+ 5%"
          trendLabel="vs periode sebelumnya"
          icon={<VoidIcon className="h-5 w-5 text-orange-600" />}
          iconBg="bg-orange-50"
          trendColor="text-orange-500"
        />
      </div>

      {/* Row 2: Medium Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <WrenchIcon />
              </div>
              <h3 className="text-sm font-semibold text-slate-700">Penjualan Sparepart</h3>
            </div>
            <CartIcon className="h-5 w-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatRupiah(summary.product_sales)}</p>
          <p className="mt-2 text-sm text-emerald-500">↑ 18% <span className="text-slate-400">vs periode sebelumnya</span></p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <CarIcon />
              </div>
              <h3 className="text-sm font-semibold text-slate-700">Penjualan Jasa</h3>
            </div>
            <DocumentIcon className="h-5 w-5 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatRupiah(summary.service_sales)}</p>
          <p className="mt-2 text-sm text-slate-400">— vs periode sebelumnya</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <CreditCardIcon />
              </div>
              <h3 className="text-sm font-semibold text-slate-700">Metode Pembayaran</h3>
            </div>
            <a href="#" className="text-xs font-medium text-blue-600 hover:underline">Lihat Detail →</a>
          </div>
          <div className="space-y-3 mt-4">
            {paymentMethods.length > 0 ? (
              paymentMethods.map((pm) => (
                <div key={pm.method} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-100">
                      <CreditCardIcon className="h-3 w-3 text-slate-500" />
                    </span>
                    {pm.method}
                  </div>
                  <span className="font-semibold text-slate-800">{formatRupiah(pm.total)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Belum ada data.</p>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Data Table */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-col border-b border-slate-100 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ListIcon />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Detail Transaksi</h3>
              <p className="text-xs text-slate-500">Daftar transaksi penjualan selama periode yang dipilih</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 md:mt-0">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari no. transaksi, kode produk, atau kasir..."
                className="w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <FilterIcon />
            </button>
          </div>
        </div>

        {transactions.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">Belum ada transaksi.</p>
        ) : (
          <PagedTable
            columns={[
              {
                key: "_no",
                label: "NO",
                render: (r: AnyRow) => <span className="text-xs text-slate-500">{r._no}</span>,
              },
              {
                key: "sale_code",
                label: "KODE TRANSAKSI ⇕",
                render: (r: AnyRow) => <span className="font-medium text-slate-800 text-xs">{r.sale_code}</span>,
              },
              {
                key: "paid_at",
                label: "WAKTU ⇕",
                render: (r: AnyRow) => <span className="text-slate-600 text-xs">{r.paid_at ? formatDateTime(r.paid_at) : "-"}</span>,
              },
              {
                key: "cashier",
                label: "KASIR ⇕",
                render: (r: AnyRow) => <span className="text-slate-600 text-xs">{r.cashier || "-"}</span>,
              },
              {
                key: "status",
                label: "STATUS ⇕",
                render: (r: AnyRow) => (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      r.status === "PAID"
                        ? "bg-emerald-50 text-emerald-600"
                        : r.status === "VOID"
                        ? "bg-red-50 text-red-600"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {r.status}
                  </span>
                ),
              },
              {
                key: "payment_method",
                label: "METODE PEMBAYARAN",
                render: (r: AnyRow) => <span className="text-slate-600 text-xs">{r.payment_method || "-"}</span>,
              },
              {
                key: "grand_total",
                label: "TOTAL ⇕",
                render: (r: AnyRow) => <span className="font-semibold text-slate-800 text-xs">{formatRupiah(r.grand_total)}</span>,
              },
              {
                key: "action",
                label: "",
                render: () => <button className="text-slate-400 hover:text-slate-600">•••</button>,
              },
            ]}
            data={transactions}
            keyExtractor={(r: AnyRow) => r.id}
          />
        )}
      </div>
    </div>
  );
}

function DashboardCard({ title, value, trend, trendLabel, icon, iconBg, trendColor }: any) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
      </div>
      <p className="text-2xl font-bold text-slate-900 mb-2">{value}</p>
      <div className="flex items-center gap-1.5 text-xs">
        <span className={`font-semibold ${trendColor}`}>
          {trend.includes('+') ? '↑' : trend === '-' ? '' : '↓'} {trend.replace('+', '')}
        </span>
        <span className="text-slate-400">{trendLabel}</span>
      </div>
    </div>
  );
}

function ServicesReportView({ data }: { data: AnyRow | null }) {
  const transactions: AnyRow[] = data?.transactions || [];
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden p-6">
        <h3 className="text-base font-bold text-slate-800 mb-1">Laporan Transaksi Jasa & Layanan</h3>
        <p className="text-xs text-slate-500 mb-6">Rekapitulasi seluruh aktivitas servis bengkel</p>
        <PagedTable
          columns={[
            { key: "_no", label: "NO", render: (r: AnyRow) => <span className="text-xs text-slate-500">{r._no}</span> },
            { key: "code", label: "KODE", render: (r: AnyRow) => <span className="font-medium text-xs text-slate-800">{r.code || "-"}</span> },
            { key: "customer", label: "PELANGGAN", render: (r: AnyRow) => <span className="text-xs text-slate-600">{r.customer || "-"}</span> },
            { key: "total", label: "TOTAL", render: (r: AnyRow) => <span className="text-xs font-semibold text-slate-800">{formatRupiah(r.total)}</span> },
          ]}
          data={transactions}
          keyExtractor={(r) => r.id}
        />
      </div>
    </div>
  );
}

function InventoryReportView({ data }: { data: AnyRow | null }) {
  const items: AnyRow[] = data?.items || [];
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden p-6">
        <h3 className="text-base font-bold text-slate-800 mb-1">Laporan Penjualan Barang</h3>
        <p className="text-xs text-slate-500 mb-6">Statistik pergerakan stok dan sparepart</p>
        <PagedTable
          columns={[
            { key: "_no", label: "NO", render: (r: AnyRow) => <span className="text-xs text-slate-500">{r._no}</span> },
            { key: "product_name", label: "PRODUK", render: (r: AnyRow) => <span className="font-medium text-xs text-slate-800">{r.product_name || "-"}</span> },
            { key: "qty", label: "TERJUAL", render: (r: AnyRow) => <span className="text-xs text-slate-600">{r.qty || 0}</span> },
            { key: "revenue", label: "PENDAPATAN", render: (r: AnyRow) => <span className="text-xs font-semibold text-slate-800">{formatRupiah(r.revenue)}</span> },
          ]}
          data={items}
          keyExtractor={(r) => r.id}
        />
      </div>
    </div>
  );
}

function FinanceReportView({ data }: { data: AnyRow | null }) {
  const expenses: AnyRow[] = data?.expenses || [];
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden p-6">
        <h3 className="text-base font-bold text-slate-800 mb-1">Laporan Pengeluaran</h3>
        <p className="text-xs text-slate-500 mb-6">Catatan biaya operasional dan pengeluaran bengkel</p>
        <PagedTable
          columns={[
            { key: "_no", label: "NO", render: (r: AnyRow) => <span className="text-xs text-slate-500">{r._no}</span> },
            { key: "description", label: "KETERANGAN", render: (r: AnyRow) => <span className="font-medium text-xs text-slate-800">{r.description || "-"}</span> },
            { key: "date", label: "TANGGAL", render: (r: AnyRow) => <span className="text-xs text-slate-600">{r.date ? formatDateTime(r.date) : "-"}</span> },
            { key: "amount", label: "JUMLAH", render: (r: AnyRow) => <span className="text-xs font-semibold text-slate-800">{formatRupiah(r.amount)}</span> },
          ]}
          data={expenses}
          keyExtractor={(r) => r.id}
        />
      </div>
    </div>
  );
}

const DocumentIcon = ({ className = "h-6 w-6" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>);
const DownloadIcon = ({ className = "h-5 w-5" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>);
const CalendarIcon = ({ className = "h-4 w-4" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>);
const ChevronRightIcon = ({ className = "h-4 w-4" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>);
const TrendingIcon = () => (<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>);
const ListIcon = () => (<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>);
const CartIcon = ({ className = "h-4 w-4" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>);
const MoneyIcon = ({ className = "h-4 w-4" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const ReceiptIcon = ({ className = "h-5 w-5" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>);
const MinusIcon = ({ className = "h-5 w-5" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>);
const VoidIcon = ({ className = "h-5 w-5" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>);
const WrenchIcon = () => (<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>);
const CarIcon = () => (<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>);
const CreditCardIcon = ({ className = "h-5 w-5" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>);
const SearchIcon = ({ className = "h-4 w-4" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>);
const FilterIcon = ({ className = "h-4 w-4" }) => (<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>);