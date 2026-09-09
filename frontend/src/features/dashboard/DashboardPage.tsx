import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboardApi } from "@/lib/api/dashboard";
import type { Sale, RevenueBreakdown } from "@/types";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRupiah, formatNumber, formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Link } from "react-router-dom";
import {
  Wallet,
  ArrowLeftRight,
  Wrench,
  Tag,
  Briefcase,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Package,
  FileText,
  Calendar,
  ChevronRight,
  Trophy,
  Ban,
  Eye,
  
} from "lucide-react";

type DatePreset = "today" | "7days" | "month" | "custom";

interface CustomRange {
  from: string;
  to: string;
}

function getPresetLabel(preset: DatePreset): string {
  switch (preset) {
    case "today":
      return "Hari Ini";
    case "7days":
      return "7 Hari";
    case "month":
      return "Bulan Ini";
    case "custom":
      return "Custom";
  }
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresetRange(preset: DatePreset): CustomRange {
  const today = new Date();
  const formatDate = (d: Date) => toLocalDateStr(d);

  switch (preset) {
    case "today":
      return { from: formatDate(today), to: formatDate(today) };
    case "7days": {
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      return { from: formatDate(from), to: formatDate(today) };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatDate(from), to: formatDate(today) };
    }
    case "custom":
      return { from: formatDate(today), to: formatDate(today) };
  }
}

function formatDateForInput(date: Date): string {
  return toLocalDateStr(date);
}

function getPeriodLabel(preset: DatePreset, apiParams?: CustomRange): string {
  switch (preset) {
    case "today":
      return "Hari Ini";
    case "7days":
      return "7 Hari Terakhir";
    case "month":
      return "Bulan Ini";
    case "custom":
      return `Custom: ${apiParams?.from} - ${apiParams?.to}`;
  }
}

function getPeriodComparisonLabel(preset: DatePreset): string {
  switch (preset) {
    case "today":
      return "vs kemarin";
    case "7days":
      return "vs 7 hari sebelumnya";
    case "month":
      return "vs bulan sebelumnya";
    case "custom":
      return "vs periode sebelumnya";
  }
}

function TrendIndicator({
  pct,
  metricType,
  comparisonLabel,
}: {
  pct: number;
  metricType: "positive" | "negative";
  comparisonLabel?: string;
}) {
  const isUp = pct > 0;
  const isNeutral = pct === 0;

  const positiveMetric = metricType === "positive";
  const color = isNeutral
    ? "text-text-secondary"
    : isUp === positiveMetric
      ? "text-emerald-600"
      : "text-rose-600";
  const icon = isNeutral ? (
    <Minus className="h-3.5 w-3.5 shrink-0 mt-0.5" />
  ) : isUp ? (
    <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5" />
  ) : (
    <TrendingDown className="h-3.5 w-3.5 shrink-0 mt-0.5" />
  );
  const label = isNeutral ? "→ 0%" : isUp ? `+${pct}%` : `${pct}%`;
  const compareText = comparisonLabel || "vs kemarin";

  return (
    <div
      className="mt-2 flex items-start gap-1 text-[11px] font-medium leading-tight break-words"
      style={{ color: color }}
    >
      {icon}
      <span className="break-words">
        {label} {compareText}
      </span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  trendPct,
  metricType = "positive",
  comparisonLabel,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  trendPct: number;
  metricType?: "positive" | "negative";
  comparisonLabel?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface p-3.5 shadow-sm flex flex-col justify-between h-full min-h-[135px]">
      <div>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}
        >
          <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
        </div>
        <div className="mt-2.5">
          <p className="text-[11px] font-medium text-text-secondary leading-snug break-words">
            {title}
          </p>
          <h4 className="mt-1 text-base xl:text-lg font-bold text-text-primary break-words">
            {value}
          </h4>
        </div>
      </div>
      <TrendIndicator
        pct={trendPct}
        metricType={metricType}
        comparisonLabel={comparisonLabel}
      />
      <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full bg-blue-500/10 blur-xl pointer-events-none" />
    </div>
  );
}

export function DashboardPage() {
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customRange, setCustomRange] = useState<CustomRange>({
    from: formatDateForInput(new Date()),
    to: formatDateForInput(new Date()),
  });
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const apiParams = useMemo(() => {
    if (datePreset === "custom") return customRange;
    return getPresetRange(datePreset);
  }, [datePreset, customRange]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard", apiParams],
    queryFn: () => getDashboardApi(apiParams),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  const handlePresetClick = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      setShowCustomPicker(false);
    } else {
      setShowCustomPicker(true);
    }
  };

  const handleCustomApply = () => {
    setDatePreset("custom");
    setShowCustomPicker(false);
  };

  const handleDatePickerOutsideClick = (e: MouseEvent) => {
    if (
      datePickerRef.current &&
      !datePickerRef.current.contains(e.target as Node)
    ) {
      setShowCustomPicker(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", handleDatePickerOutsideClick);
    return () =>
      document.removeEventListener("mousedown", handleDatePickerOutsideClick);
  }, []);

  if (isLoading) return <LoadingState label="Memuat dashboard..." />;
  if (error)
    return (
      <ErrorState
        message={(error as Error).message || "Gagal memuat dashboard."}
        onRetry={() => refetch()}
      />
    );
  if (!data)
    return (
      <ErrorState
        message="Tidak ada data dashboard."
        onRetry={() => refetch()}
      />
    );

  const {
    kpi,
    revenue_series,
    revenue_breakdown,
    top_products,
    low_stock,
    recent_sales,
    recent_voids,
  } = data;

  const periodLabel = getPeriodLabel(datePreset, apiParams);
  const comparisonLabel = getPeriodComparisonLabel(datePreset);

  return (
    <div className="space-y-6 pb-8">
      {/* Header dengan Filter Button Tanggal */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        
        {/* Action Controls & Quick Date Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Group Button Filter Tanggal */}
          <div
            className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 shadow-sm relative"
            ref={datePickerRef}
          >
            {(["today", "7days", "month"] as DatePreset[]).map((preset) => (
              <Button
                key={preset}
                variant={datePreset === preset ? "primary" : "ghost"}
                size="sm"
                onClick={() => handlePresetClick(preset)}
                className="h-7 text-xs px-2.5 rounded-md font-medium"
              >
                {getPresetLabel(preset)}
              </Button>
            ))}

            <Button
              variant={datePreset === "custom" ? "primary" : "ghost"}
              size="sm"
              onClick={() => handlePresetClick("custom")}
              className="h-7 text-xs px-2.5 rounded-md font-medium flex items-center gap-1"
            >
              <Calendar className="h-3.5 w-3.5" />
              {datePreset === "custom"
                ? `Custom (${apiParams.from})`
                : "Custom"}
            </Button>

            {/* Popover Rentang Tanggal Custom */}
            {showCustomPicker && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 bg-white border border-border rounded-xl shadow-lg p-3 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-xs font-bold text-text-primary">
                    Pilih Rentang Tanggal
                  </span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-text-secondary block mb-1">
                      Dari Tanggal
                    </label>
                    <input
                      type="date"
                      value={customRange.from}
                      onChange={(e) =>
                        setCustomRange({ ...customRange, from: e.target.value })
                      }
                      className="w-full px-2 py-1 border border-border rounded-md text-xs"
                      max={formatDateForInput(new Date())}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-text-secondary block mb-1">
                      Sampai Tanggal
                    </label>
                    <input
                      type="date"
                      value={customRange.to}
                      onChange={(e) =>
                        setCustomRange({ ...customRange, to: e.target.value })
                      }
                      className="w-full px-2 py-1 border border-border rounded-md text-xs"
                      max={formatDateForInput(new Date())}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full text-xs h-8 mt-1"
                    onClick={handleCustomApply}
                  >
                    Terapkan
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Tombol Refresh */}
         
        </div>
      </div>

      {/* KPI Cards (6 Grid Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-stretch">
        <KpiCard
          title={`Omzet ${periodLabel}`}
          value={formatRupiah(kpi.period_revenue ?? kpi.today_revenue ?? 0)}
          icon={Wallet}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          trendPct={
            kpi.period_revenue_vs_prev_pct ??
            kpi.today_revenue_vs_yesterday_pct ??
            0
          }
          metricType="positive"
          comparisonLabel={comparisonLabel}
        />
        <KpiCard
          title={`Transaksi ${periodLabel}`}
          value={formatNumber(
            kpi.period_transactions ?? kpi.today_transactions ?? 0,
          )}
          icon={ArrowLeftRight}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          trendPct={
            kpi.period_transactions_vs_prev_pct ??
            kpi.today_transactions_vs_yesterday_pct ??
            0
          }
          metricType="positive"
          comparisonLabel={comparisonLabel}
        />
        <KpiCard
          title={`Servis ${periodLabel}`}
          value={formatNumber(
            kpi.period_service_orders ?? kpi.today_service_orders ?? 0,
          )}
          icon={Wrench}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          trendPct={
            kpi.period_service_orders_vs_prev_pct ??
            kpi.today_service_orders_vs_yesterday_pct ??
            0
          }
          metricType="positive"
          comparisonLabel={comparisonLabel}
        />
        <KpiCard
          title={`Pengeluaran ${periodLabel}`}
          value={formatRupiah(kpi.period_expenses ?? kpi.today_expenses ?? 0)}
          icon={Tag}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          trendPct={
            kpi.period_expenses_vs_prev_pct ??
            kpi.today_expenses_vs_yesterday_pct ??
            0
          }
          metricType="negative"
          comparisonLabel={comparisonLabel}
        />
        <KpiCard
          title="Estimasi Hasil Usaha"
          value={formatRupiah(kpi.estimated_result)}
          icon={Briefcase}
          iconBg="bg-cyan-50"
          iconColor="text-cyan-600"
          trendPct={0}
          metricType="positive"
        />
        <KpiCard
          title="Stok Rendah"
          value={formatNumber(kpi.low_stock_count)}
          icon={AlertTriangle}
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
          trendPct={kpi.low_stock_count_vs_yesterday_pct ?? 0}
          metricType="negative"
          comparisonLabel="vs kemarin"
        />
      </div>

      {/* Charts & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Chart Card */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-text-primary">
                  Grafik Omzet Harian
                </h3>
                <p className="text-xs text-text-secondary">{periodLabel}</p>
              </div>
            </div>
          </div>

          {revenue_series.length === 0 ? (
            <div className="flex-1 min-h-[220px] flex items-center justify-center">
              <EmptyState title="Belum ada data omzet" />
            </div>
          ) : (
            <div className="w-full h-64 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenue_series}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e5e7eb"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    fontSize={11}
                    tick={{ fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    fontSize={11}
                    tick={{ fill: "#6b7280" }}
                    width={60}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)}
                  />
                  <Tooltip formatter={(v) => formatRupiah(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#rev)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Revenue Breakdown Card */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 pb-3 border-b border-border/50">
            <FileText className="h-5 w-5 text-blue-600 shrink-0" />
            <h3 className="text-base font-bold text-text-primary">
              Ringkasan Penjualan
            </h3>
          </div>

          <div className="space-y-3 py-2 flex-1 flex flex-col justify-center">
            {/* Item Produk */}
            <div className="rounded-xl border border-border/60 bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mt-0.5">
                    <Wallet className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-primary leading-snug break-words">
                      Produk / Sparepart
                    </p>
                    <p className="text-[11px] text-text-secondary leading-tight mt-0.5 break-words">
                      Penjualan barang
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs sm:text-sm font-bold text-text-primary">
                    {formatRupiah(
                      (revenue_breakdown as RevenueBreakdown).products,
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-1 flex justify-end">
                <TrendIndicator
                  pct={
                    (revenue_breakdown as RevenueBreakdown)
                      .products_vs_prev_pct ??
                    (revenue_breakdown as RevenueBreakdown)
                      .products_vs_yesterday_pct ??
                    0
                  }
                  metricType="positive"
                  comparisonLabel={comparisonLabel}
                />
              </div>
            </div>

            {/* Item Jasa */}
            <div className="rounded-xl border border-border/60 bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mt-0.5">
                    <Wrench className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-primary leading-snug break-words">
                      Jasa Servis
                    </p>
                    <p className="text-[11px] text-text-secondary leading-tight mt-0.5 break-words">
                      Pendapatan jasa
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs sm:text-sm font-bold text-text-primary">
                    {formatRupiah(
                      (revenue_breakdown as RevenueBreakdown).services,
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-1 flex justify-end">
                <TrendIndicator
                  pct={
                    (revenue_breakdown as RevenueBreakdown)
                      .services_vs_prev_pct ??
                    (revenue_breakdown as RevenueBreakdown)
                      .services_vs_yesterday_pct ??
                    0
                  }
                  metricType="positive"
                  comparisonLabel={comparisonLabel}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Left Column: Top Products & Recent Sales */}
        <div className="space-y-4">
          {/* Top Products */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col justify-between h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-blue-600 shrink-0" />
                <h3 className="text-base font-bold text-text-primary">
                  Produk Terlaris
                </h3>
              </div>
              <Link
                to="/produk"
                className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
              >
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {top_products.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState title="Belum ada data" />
              </div>
            ) : (
              <ul className="space-y-2.5 pt-2 flex-1 overflow-y-auto">
                {top_products.slice(0, 5).map((p, idx) => (
                  <li
                    key={p.product_id}
                    className="flex items-center justify-between py-1 gap-2 border-b border-border/30 last:border-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-bold text-text-secondary w-4 text-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 border border-border text-text-secondary">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-primary break-words leading-tight">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-text-secondary">
                          {formatNumber(p.total_qty)} terjual
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <p className="text-xs sm:text-sm font-bold text-text-primary">
                        {formatRupiah(p.total_revenue)}
                      </p>
                      <ChevronRight className="h-4 w-4 text-text-secondary" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Sales */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col justify-between h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                <h3 className="text-base font-bold text-text-primary">
                  Transaksi Terbaru
                </h3>
              </div>
              <Link
                to="/riwayat"
                className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
              >
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {recent_sales.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState title="Belum ada transaksi hari ini" />
              </div>
            ) : (
              <div className="overflow-x-auto pt-2 flex-1 hide-scrollbar">
                <table className="w-full text-left text-xs min-w-[320px]">
                  <thead>
                    <tr className="border-b border-border/60 text-text-secondary">
                      <th className="pb-2 font-medium">No. Transaksi</th>
                      <th className="pb-2 font-medium">Produk/Jasa</th>
                      <th className="pb-2 font-medium">Total</th>
                      <th className="pb-2 font-medium text-right">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {recent_sales.slice(0, 5).map((s) => (
                      <tr key={s.id} className="group">
                        <td className="py-2 font-semibold text-text-primary break-all">
                          {s.sale_code}
                        </td>
                        <td className="py-2 text-text-primary break-words min-w-[140px]">
                          {(s.items?.length ? s.items.slice(0, 2) : []).map((item) => (
                            <span
                              key={item.id}
                              className="flex items-center gap-1.5 py-0.5"
                            >
                              <span className="truncate max-w-[150px]">
                                {item.item_name_snapshot}
                              </span>
                              <span className="text-[10px] font-medium text-text-secondary whitespace-nowrap">
                                ×{formatNumber(item.quantity)}
                              </span>
                            </span>
                          ))}
                          {s.items && s.items.length > 2 ? (
                            <span className="block pt-0.5 text-[11px] text-text-secondary">
                              +{s.items.length - 2} lainnya
                            </span>
                          ) : (
                            !s.items?.length && (
                              <span className="text-text-secondary">
                                {s.cashier?.name || "Kasir Bengkel"}
                              </span>
                            )
                          )}
                        </td>
                        <td className="py-2 font-medium text-text-primary whitespace-nowrap">
                          {formatRupiah(s.grand_total)}
                        </td>
                        <td className="py-2 text-right text-text-secondary whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            <span>
                              {formatDateTime(s.paid_at).split(",")[0] ||
                                formatDateTime(s.paid_at)}
                            </span>
                            <span className="text-[10px] text-text-secondary">
                              {formatDateTime(s.paid_at).split(",")[1] || ""}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Low Stock & Recent Voids */}
        <div className="space-y-4">
          {/* Low Stock */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col justify-between h-[340px]">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                <h3 className="text-base font-bold text-text-primary">
                  Stok Rendah
                </h3>
              </div>
              <Link
                to="/produk"
                className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
              >
                Lihat Semua <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {low_stock.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <EmptyState title="Semua stok aman" />
              </div>
            ) : (
              <ul className="space-y-2.5 pt-2 flex-1 overflow-y-auto">
                {low_stock.slice(0, 5).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between py-1 gap-2 border-b border-border/30 last:border-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 border border-border text-text-secondary">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-primary break-words leading-tight">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-text-secondary">
                          {formatNumber(p.current_stock)} pcs
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Badge
                        tone={p.current_stock === 0 ? "danger" : "warning"}
                      >
                        {p.current_stock === 0 ? "Stok Habis" : "Stok Menipis"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Voids */}
          <RecentVoidsList voids={recent_voids} />
        </div>
      </div>
    </div>
  );
}

function RecentVoidsList({ voids }: { voids: Sale[] }) {
  const [target, setTarget] = useState<Sale | null>(null);

  return (
    <>
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm flex flex-col justify-between h-[340px]">
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-rose-600 shrink-0" />
            <h3 className="text-base font-bold text-text-primary">
              Void Terbaru
            </h3>
          </div>
          <Link
            to="/riwayat"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
          >
            Lihat Semua <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {voids.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState title="Tidak ada transaksi dibatalkan" />
          </div>
        ) : (
          <ul className="space-y-2.5 pt-2 flex-1 overflow-y-auto">
            {voids.slice(0, 5).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between py-1 gap-2 border-b border-border/40 last:border-none"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
                    <Ban className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary break-words leading-tight">
                      {s.sale_code}
                    </p>
                    <p className="text-[11px] text-text-secondary break-words leading-tight">
                      {s.void_reason || "Dibatalkan"} ·{" "}
                      {formatDateTime(s.voided_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-bold text-rose-600">
                    {formatRupiah(s.grand_total)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTarget(s)}
                    className="h-7 px-1.5 text-xs text-text-secondary hover:text-text-primary flex items-center gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Detail</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!target}
        title="Detail Void"
        message={
          target
            ? `Transaksi ${target.sale_code} (${formatRupiah(target.grand_total)}) dibatalkan dengan alasan: ${target.void_reason}`
            : ""
        }
        confirmLabel="Tutup"
        cancelLabel="Batal"
        onConfirm={() => setTarget(null)}
        onCancel={() => setTarget(null)}
      />
    </>
  );
}
