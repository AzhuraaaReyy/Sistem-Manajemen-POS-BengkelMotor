import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Select } from "@/components/ui/Select";
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
import { DownloadIcon } from "@/components/shared/icons";

type TabKey = "finance" | "sales" | "services" | "inventory";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

type AnyRow = Record<string, any>;
const REPORT_PAGE_SIZE = 10;

// ==================== REUSABLE DATE FILTER BAR ====================

interface DateFilterBarProps {
  title?: string;
  description?: string;
  from: string;
  to: string;
  onFromChange: (date: string) => void;
  onToChange: (date: string) => void;
}

export function DateFilterBar({
  title = "Rentang Tanggal Laporan",
  description = "Pilih tanggal awal dan tanggal akhir untuk menyaring data laporan.",
  from,
  to,
  onFromChange,
  onToChange,
}: DateFilterBarProps) {
  return (
    <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/80 shrink-0 mt-0.5">
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
            {title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
        <DateRangePicker
          from={from}
          to={to}
          onFromChange={onFromChange}
          onToChange={onToChange}
        />
      </div>
    </div>
  );
}

// ==================== BADGE STATUS & UI HELPERS ====================

function StatusBadge({ status }: { status: string }) {
  const normalized = (status || "").toUpperCase();
  if (["PAID", "DONE", "COMPLETED", "SELESAI"].includes(normalized)) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 tracking-wide">
        PAID
      </span>
    );
  }
  if (["VOID", "CANCELLED", "BATAL"].includes(normalized)) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 border border-rose-500/20 tracking-wide">
        VOID
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20 tracking-wide">
      {status}
    </span>
  );
}

function paginationMeta(
  meta: Record<string, any> | undefined,
  rowCount: number,
): { page: number; lastPage: number; total: number } {
  return {
    page: meta?.current_page ?? 1,
    lastPage:
      meta?.last_page ?? Math.max(1, Math.ceil(rowCount / REPORT_PAGE_SIZE)),
    total: meta?.total ?? rowCount,
  };
}

function PagedTable<T>({
  columns,
  rows,
  page,
  lastPage,
  total,
  onPageChange,
  keyExtractor,
  label = "data",
}: {
  columns: Column<T>[];
  rows: T[];
  page: number;
  lastPage: number;
  total: number;
  onPageChange: (page: number) => void;
  keyExtractor: (r: T) => string | number;
  label?: string;
}) {
  const safePage = Math.min(page, Math.max(1, lastPage));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <DataTable columns={columns} data={rows} keyExtractor={keyExtractor} />
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 pt-1">
        <span>
          Menampilkan{" "}
          <strong className="text-slate-800 font-semibold">
            {rows.length}
          </strong>{" "}
          dari{" "}
          <strong className="text-slate-800 font-semibold">
            {total}
          </strong>{" "}
          {label}
        </span>
        <Pagination
          currentPage={safePage}
          lastPage={lastPage}
          total={total}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}

// ==================== MAIN REPORTS PAGE ====================

export function ReportsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("finance");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [reportPage, setReportPage] = useState(1);

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
    const params = { from, to, page: reportPage, per_page: REPORT_PAGE_SIZE };
    try {
      if (tab === "finance") setFinance(await getFinanceReportApi(params));
      else if (tab === "sales") setSales(await getSalesReportApi(params));
      else if (tab === "services")
        setServices(await getServiceReportApi(params));
      else if (tab === "inventory")
        setInventory(await getInventoryReportApi(params));
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Gagal memuat data laporan.");
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, reportPage]);

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
      a.download = `Laporan_Bengkel_${tab.toUpperCase()}_${from}_s.d_${to}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Dokumen laporan resmi berhasil diekspor.");
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message || "Gagal mengekspor laporan.");
    } finally {
      setExporting(false);
    }
  };

  const tabs: {
    value: TabKey;
    title: string;
    subtitle: string;
    code: string;
  }[] = [
    {
      value: "finance",
      title: "Laba Rugi & Arus Kas",
      subtitle: "Margin Kotor, HPP, & Laba Bersih Usaha",
      code: "P&L",
    },
    {
      value: "sales",
      title: "Audit Penjualan & Void",
      subtitle: "Rekonsiliasi Kasir, Diskon, & Batal",
      code: "SLS",
    },
    {
      value: "services",
      title: "Jasa & Komisi Mekanik",
      subtitle: "Audit Work Order & Bagi Hasil Mekanik",
      code: "SVC",
    },
    {
      value: "inventory",
      title: "Valuasi Stok & HPP Modal",
      subtitle: "Nilai Aset Part Gudang & Fast/Slow Moving",
      code: "INV",
    },
  ];

  return (
    <div className="space-y-6 bg-[#F8FAFC] p-6 min-h-screen font-sans text-slate-900 antialiased">
      {/* Header Utama */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60 tracking-wider uppercase">
              Modul Owner & Akuntansi
            </span>
            <span className="text-xs text-slate-400 font-medium">
              • Standar Bisnis Bengkel UMKM
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1.5">
            Laporan Evaluasi & Audit Keuangan
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Analisis presisi untuk memastikan tidak ada kebocoran kas, kesalahan
            pencatatan HPP modal, maupun selisih transaksi operasional.
          </p>
        </div>

        {/* Panel Ekspor */}
        <div className="flex items-center gap-3 self-start lg:self-center pt-2 lg:pt-0">
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/90 rounded-2xl p-2 shadow-2xs">
            <Select
              className="border-none text-xs font-semibold text-slate-700 bg-transparent focus:ring-0 cursor-pointer px-2"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
              options={[
                { value: "xlsx", label: "Format Excel (.xlsx)" },
                { value: "pdf", label: "Dokumen PDF (.pdf)" },
              ]}
            />
            <Button
              onClick={doExport}
              loading={exporting}
              className="bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Cetak Laporan
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Rentang Tanggal Reusable */}
      <DateFilterBar
        title="Rentang Tanggal Laporan"
        description="Pilih tanggal awal dan tanggal akhir untuk menyaring data laporan operasional."
        from={from}
        to={to}
        onFromChange={(d) => {
          setFrom(d);
          setReportPage(1);
        }}
        onToChange={(d) => {
          setTo(d);
          setReportPage(1);
        }}
      />

      {/* Navigasi Tab Laporan Spesifik */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {tabs.map((t) => {
          const isActive = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => {
                setTab(t.value);
                setReportPage(1);
              }}
              className={`p-4 rounded-2xl text-left transition-all border flex flex-col justify-between active:scale-[0.98] cursor-pointer ${
                isActive
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                  : "bg-white text-slate-600 border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded tracking-wide ${
                    isActive
                      ? "bg-blue-500/80 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t.code}
                </span>
                <span
                  className={`text-xs font-semibold ${isActive ? "text-blue-100" : "text-slate-400"}`}
                >
                  Buka →
                </span>
              </div>
              <div>
                <p
                  className={`text-sm font-extrabold ${isActive ? "text-white" : "text-slate-900"}`}
                >
                  {t.title}
                </p>
                <p
                  className={`text-[11px] mt-0.5 leading-snug ${isActive ? "text-blue-100" : "text-slate-500"}`}
                >
                  {t.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Konten Laporan */}
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : tab === "finance" ? (
        <FinanceDetailReportView data={finance} onPageChange={setReportPage} />
      ) : tab === "sales" ? (
        <SalesAuditReportView data={sales} onPageChange={setReportPage} />
      ) : tab === "services" ? (
        <ServiceMechanicReportView
          data={services}
          onPageChange={setReportPage}
        />
      ) : (
        <InventoryValuationReportView
          data={inventory}
          onPageChange={setReportPage}
        />
      )}
    </div>
  );
}

/* ==================== 1. LABA RUGI & ARUS KAS ==================== */

function FinanceDetailReportView({
  data,
  onPageChange,
}: {
  data: AnyRow | null;
  onPageChange: (page: number) => void;
}) {
  if (!data) return null;
  const summary = data.summary || {};
  const expenses: AnyRow[] = data.expenses || [];
  const expensesMeta = paginationMeta(data.expenses_pagination, expenses.length);

  const revenue = Number(summary.revenue || 0);
  const cogs = Number(summary.cogs || 0);
  const grossProfit = revenue - cogs;
  const opExpenses = Number(summary.expenses || 0);
  const netProfit = grossProfit - opExpenses;
  const profitMargin =
    revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Laporan Laba Rugi Operasional Bengkel
            </h3>
            <p className="text-xs text-slate-500">
              Perhitungan riil keuntungan kotor hingga laba bersih setelah
              dipotong HPP & Beban Operasional
            </p>
          </div>
          <div className="bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200/60 text-right">
            <span className="text-xs text-slate-500 font-semibold">
              Net Profit Margin:{" "}
            </span>
            <span
              className={`text-sm font-black tabular-nums ${Number(profitMargin) >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {profitMargin}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
              1. Total Omzet Penjualan
            </span>
            <p className="text-xl font-black text-slate-900 tabular-nums">
              {formatRupiah(revenue)}
            </p>
            <p className="text-[10px] text-slate-400">
              Pendapatan kotor sparepart & jasa
            </p>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-100 space-y-1">
            <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider">
              2. Modal HPP Sparepart (COGS)
            </span>
            <p className="text-xl font-black text-rose-600 tabular-nums">
              - {formatRupiah(cogs)}
            </p>
            <p className="text-[10px] text-rose-500">
              Harga beli modal part yang terjual
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-1">
            <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">
              3. Laba Kotor (Gross Profit)
            </span>
            <p className="text-xl font-black text-emerald-700 tabular-nums">
              {formatRupiah(grossProfit)}
            </p>
            <p className="text-[10px] text-emerald-600">
              Margin sebelum beban operasional
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 text-white shadow-md space-y-1">
            <span className="text-[10px] font-extrabold text-slate-300 uppercase tracking-wider">
              4. Estimasi Laba Bersih
            </span>
            <p className="text-xl font-black text-emerald-400 tabular-nums">
              {formatRupiah(netProfit)}
            </p>
            <p className="text-[10px] text-slate-400">
              Laba Kotor - Total Pengeluaran Kas
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Rincian Pengeluaran Operasional (Beban Kas)
            </h3>
            <p className="text-xs text-slate-500">
              List pengeluaran seperti listrik, air, konsumsi, sewa, dan
              sparepart operasional
            </p>
          </div>
          <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-100">
            Total Beban: {formatRupiah(opExpenses)}
          </span>
        </div>

        {expenses.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Tidak ada pencatatan pengeluaran operasional pada periode ini.
          </div>
        ) : (
          <PagedTable
            columns={[
              {
                key: "expense_date",
                label: "Tanggal Kas Keluar",
                render: (r: AnyRow) => (
                  <span className="text-xs text-slate-700 font-medium">
                    {r.expense_date}
                  </span>
                ),
              },
              {
                key: "category",
                label: "Kategori Beban",
                render: (r: AnyRow) => (
                  <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    {r.category}
                  </span>
                ),
              },
              {
                key: "description",
                label: "Keterangan",
                render: (r: AnyRow) => (
                  <span className="text-xs text-slate-600">
                    {r.description || "-"}
                  </span>
                ),
              },
              {
                key: "created_by",
                label: "Dicatat Oleh",
                render: (r: AnyRow) => (
                  <span className="text-xs text-slate-600">
                    {r.created_by || "Admin"}
                  </span>
                ),
              },
              {
                key: "amount",
                label: "Nominal Keluar",
                render: (r: AnyRow) => (
                  <span className="font-bold text-rose-600 text-xs tabular-nums">
                    {formatRupiah(r.amount)}
                  </span>
                ),
              },
            ]}
            rows={expenses}
            page={expensesMeta.page}
            lastPage={expensesMeta.lastPage}
            total={expensesMeta.total}
            onPageChange={onPageChange}
            keyExtractor={(r: AnyRow) => r.id}
            label="pengeluaran"
          />
        )}
      </div>
    </div>
  );
}

/* ==================== 2. AUDIT PENJUALAN, DISKON, & VOID ==================== */

function SalesAuditReportView({
  data,
  onPageChange,
}: {
  data: AnyRow | null;
  onPageChange: (page: number) => void;
}) {
  if (!data) return null;
  const summary = data.summary || {};
  const paymentMethods: AnyRow[] = data.payment_methods || [];
  const transactions: AnyRow[] = data.transactions || [];
  const transactionsMeta = paginationMeta(
    data.transactions_pagination,
    transactions.length,
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3 lg:col-span-2">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
            Rekonsiliasi Metode Pembayaran (Kasir vs Rekening)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {paymentMethods.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">
                Belum ada data metode pembayaran.
              </p>
            ) : (
              paymentMethods.map((pm) => (
                <div
                  key={pm.method}
                  className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60"
                >
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    {pm.method}
                  </span>
                  <p className="text-base font-black text-slate-900 mt-0.5 tabular-nums">
                    {formatRupiah(pm.total)}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {pm.count}x Transaksi
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
            Kontrol Potongan & Batal
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">
                Total Potongan Diskon
              </span>
              <span className="font-extrabold text-rose-600 tabular-nums">
                {formatRupiah(summary.discount ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2.5">
              <span className="text-slate-500 font-medium">
                Nilai Transaksi Void/Batal
              </span>
              <span className="font-extrabold text-amber-600 tabular-nums">
                {formatRupiah(summary.voided ?? 0)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 italic pt-1">
              *Perhatikan angka VOID secara berkala untuk memantau potensi
              pembatalan transaksi abnormal.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Jurnal Audit Transaksi Penjualan
            </h3>
            <p className="text-xs text-slate-500">
              Catatan rinci tiap penjualan kasir beserta status pembayaran untuk
              audit harian
            </p>
          </div>
        </div>

        <PagedTable
          columns={[
            {
              key: "sale_code",
              label: "Kode TRX",
              render: (r: AnyRow) => (
                <span className="font-mono text-xs font-bold text-slate-800">
                  {r.sale_code}
                </span>
              ),
            },
            {
              key: "paid_at",
              label: "Waktu TRX",
              render: (r: AnyRow) => (
                <span className="text-xs text-slate-600">
                  {r.paid_at ? formatDateTime(r.paid_at) : "Dibatalkan"}
                </span>
              ),
            },
            {
              key: "cashier",
              label: "Kasir",
              render: (r: AnyRow) => (
                <span className="text-xs text-slate-700 font-medium">
                  {r.cashier || "Admin"}
                </span>
              ),
            },
            {
              key: "status",
              label: "Status TRX",
              render: (r: AnyRow) => <StatusBadge status={r.status} />,
            },
            {
              key: "grand_total",
              label: "Total Bayar",
              render: (r: AnyRow) => (
                <span className="font-extrabold text-slate-900 text-xs tabular-nums">
                  {formatRupiah(r.grand_total)}
                </span>
              ),
            },
          ]}
            rows={transactions}
            page={transactionsMeta.page}
            lastPage={transactionsMeta.lastPage}
            total={transactionsMeta.total}
            onPageChange={onPageChange}
            keyExtractor={(r: AnyRow) => r.id}
            label="transaksi"
          />
      </div>
    </div>
  );
}

/* ==================== 3. JASA & KOMISI MEKANIK ==================== */

function ServiceMechanicReportView({
  data,
  onPageChange,
}: {
  data: AnyRow | null;
  onPageChange: (page: number) => void;
}) {
  if (!data) return null;
  const summary = data.summary || {};
  const topServices: AnyRow[] = data.top_services || [];
  const orders: AnyRow[] = data.orders || [];
  const ordersMeta = paginationMeta(data.orders_pagination, orders.length);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Total Unit Servis
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
            {formatNumber(summary.total_orders ?? 0)} Motor
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Servis Selesai
          </span>
          <p className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
            {formatNumber(summary.by_status?.DONE ?? 0)} Motor
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Omzet Jasa Murni
          </span>
          <p className="text-2xl font-black text-blue-600 mt-1 tabular-nums">
            {formatRupiah(summary.service_revenue ?? 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
            Pekerjaan Jasa Paling Laris
          </h3>
          <PagedTable
            columns={[
              {
                key: "service_name",
                label: "Jenis Pekerjaan Servis",
                render: (r: AnyRow) => (
                  <span className="font-semibold text-xs text-slate-800">
                    {r.service_name}
                  </span>
                ),
              },
              {
                key: "count",
                label: "Jumlah",
                render: (r: AnyRow) => (
                  <span className="text-xs text-slate-600 font-medium tabular-nums">
                    {formatNumber(r.count)}x
                  </span>
                ),
              },
              {
                key: "total",
                label: "Total Omzet Jasa",
                render: (r: AnyRow) => (
                  <span className="font-bold text-slate-900 text-xs tabular-nums">
                    {formatRupiah(r.total)}
                  </span>
                ),
              },
            ]}
            rows={topServices}
            page={1}
            lastPage={1}
            total={topServices.length}
            onPageChange={onPageChange}
            keyExtractor={(r: AnyRow) => r.service_name}
            label="jasa terlaris"
          />
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
            Audit Work Order (WO) Bengkel
          </h3>
          <PagedTable
            columns={[
              {
                key: "order_code",
                label: "Kode WO",
                render: (r: AnyRow) => (
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {r.order_code}
                  </span>
                ),
              },
              {
                key: "customer",
                label: "Pelanggan",
                render: (r: AnyRow) => (
                  <span className="text-xs text-slate-700">
                    {r.customer || "Pelanggan Umum"}
                  </span>
                ),
              },
              {
                key: "motorcycle_type",
                label: "Tipe Motor",
                render: (r: AnyRow) => (
                  <span className="text-xs text-slate-600">
                    {r.motorcycle_type || "-"}
                  </span>
                ),
              },
              {
                key: "status",
                label: "Status WO",
                render: (r: AnyRow) => <StatusBadge status={r.status} />,
              },
            ]}
            rows={orders}
            page={ordersMeta.page}
            lastPage={ordersMeta.lastPage}
            total={ordersMeta.total}
            onPageChange={onPageChange}
            keyExtractor={(r: AnyRow) => r.id}
            label="work order"
          />
        </div>
      </div>
    </div>
  );
}

/* ==================== 4. VALUASI STOK & HPP MODAL ==================== */

function InventoryValuationReportView({
  data,
  onPageChange,
}: {
  data: AnyRow | null;
  onPageChange: (page: number) => void;
}) {
  if (!data) return null;
  const summary = data.summary || {};
  const topSold: AnyRow[] = data.top_sold || [];
  const lowStock: AnyRow[] = data.low_stock || [];
  const lowStockMeta = paginationMeta(data.low_stock_pagination, lowStock.length);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Total Part Aktif
          </span>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
            {formatNumber(summary.total_products ?? 0)} SKU
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider">
            Part Stok Kritis (&lt; Min)
          </span>
          <p className="text-2xl font-black text-rose-600 mt-1 tabular-nums">
            {formatNumber(summary.low_stock_count ?? 0)} SKU
          </p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Total Nilai Modal Gudang (Aset)
          </span>
          <p className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
            {formatRupiah(summary.inventory_value ?? 0)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Nilai aset berdasarkan HPP beli modal
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-rose-600 border-b border-slate-100 pb-2">
            Peringatan Stok Kritis (Segera Belanja Modal)
          </h3>
          <PagedTable
            columns={[
              {
                key: "name",
                label: "Nama Sparepart",
                render: (r: AnyRow) => (
                  <span className="font-semibold text-xs text-slate-800">
                    {r.name}
                  </span>
                ),
              },
              {
                key: "sku",
                label: "SKU",
                render: (r: AnyRow) => (
                  <span className="font-mono text-xs text-slate-500">
                    {r.sku}
                  </span>
                ),
              },
              {
                key: "current_stock",
                label: "Sisa",
                render: (r: AnyRow) => (
                  <span className="text-xs font-black text-rose-600 tabular-nums">
                    {formatNumber(r.current_stock)}
                  </span>
                ),
              },
              {
                key: "min_stock",
                label: "Batas Min",
                render: (r: AnyRow) => (
                  <span className="text-xs text-slate-500 tabular-nums">
                    {formatNumber(r.min_stock)}
                  </span>
                ),
              },
            ]}
            rows={lowStock}
            page={lowStockMeta.page}
            lastPage={lowStockMeta.lastPage}
            total={lowStockMeta.total}
            onPageChange={onPageChange}
            keyExtractor={(r: AnyRow) => r.id}
            label="produk stok kritis"
          />
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
            Sparepart Paling Laris (Fast Moving)
          </h3>
          <PagedTable
            columns={[
              {
                key: "name",
                label: "Nama Sparepart",
                render: (r: AnyRow) => (
                  <span className="font-semibold text-xs text-slate-800">
                    {r.name}
                  </span>
                ),
              },
              {
                key: "quantity",
                label: "Terjual",
                render: (r: AnyRow) => (
                  <span className="text-xs font-black text-blue-600 tabular-nums">
                    {formatNumber(r.quantity)} Pcs
                  </span>
                ),
              },
            ]}
            rows={topSold}
            page={1}
            lastPage={1}
            total={topSold.length}
            onPageChange={onPageChange}
            keyExtractor={(r: AnyRow) => r.name}
            label="produk terlaris"
          />
        </div>
      </div>
    </div>
  );
}
