import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SaleStatusBadge } from "@/components/ui/badges";
import { CountdownBadge } from "@/components/ui/CountdownBadge";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/app/auth/AuthContext";
import {
  getSalesApi,
  getSaleApi,
  voidSaleApi,
  expireSaleApi,
} from "@/lib/api/sales";
import { formatRupiah, formatDateTime, formatNumber } from "@/lib/formatters";
import { SALE_STATUS_LABEL, PAYMENT_LABEL } from "@/lib/constants";
import type { Sale } from "@/types";

export function SalesHistoryPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN");

  const [data, setData] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [detail, setDetail] = useState<Sale | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [voidTarget, setVoidTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);

  const [expireTarget, setExpireTarget] = useState<Sale | null>(null);
  const [expireReason, setExpireReason] = useState("");
  const [expireLoading, setExpireLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSalesApi({
        search: search || undefined,
        status: status || undefined,
        page,
        per_page: 10,
      });
      setData(res.data);
      setLastPage(res.last_page);
      setTotal(res.total);
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message || "Gagal memuat riwayat transaksi.");
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    load();
  }, [load, page]);

  // Client-side expiry check and auto-expire
  const checkAndExpireTransactions = useCallback(async () => {
    const now = Date.now();
    const toExpire = data.filter(
      (sale) =>
        sale.status === "PENDING" &&
        sale.payment_expires_at &&
        new Date(sale.payment_expires_at).getTime() < now,
    );

    for (const sale of toExpire) {
      try {
        await expireSaleApi(sale.id, "Waktu pembayaran habis (auto-client).");
      } catch {
        // Silent fail - cron job will handle it
      }
    }

    if (toExpire.length > 0) {
      load();
    }
  }, [data, load]);

  // Periodic expiry check
  useEffect(() => {
    const interval = setInterval(checkAndExpireTransactions, 5000);
    return () => clearInterval(interval);
  }, [checkAndExpireTransactions]);

  // Real-time polling untuk status transaksi PENDING
  useEffect(() => {
    if (status !== "" && status !== "PENDING") return;

    const poll = async () => {
      try {
        const res = await getSalesApi({
          search: search || undefined,
          status: status || undefined,
          page,
          per_page: 10,
        });
        setData(res.data);
      } catch {
        // Silent fail
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [search, status, page]);

  useEffect(() => {
    const resumePaymentId = searchParams.get("resume_payment");
    if (resumePaymentId) {
      const id = Number(resumePaymentId);
      if (!isNaN(id)) {
        navigate(`/pos?resume_payment=${id}`);
      }
    }
  }, [searchParams, navigate]);

  const openDetail = async (sale: Sale) => {
    setDetail(sale);
    setDetailLoading(true);
    try {
      const full = await getSaleApi(sale.id);
      setDetail(full);
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message || "Gagal memuat detail transaksi.");
    } finally {
      setDetailLoading(false);
    }
  };

  const openReceipt = (sale: Sale) => {
    navigate(`/riwayat/${sale.id}/struk`);
  };

  const openVoid = (sale: Sale) => {
    setVoidReason("");
    setVoidTarget(sale);
  };

  const confirmVoid = async () => {
    if (!voidTarget) return;
    if (!voidReason.trim()) {
      toast.error("Alasan void wajib diisi.");
      return;
    }
    setVoidLoading(true);
    try {
      await voidSaleApi(voidTarget.id, voidReason.trim());
      toast.success(`Transaksi ${voidTarget.sale_code} berhasil di-void.`);
      setVoidTarget(null);
      setDetail(null);
      load();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message || "Gagal membatalkan transaksi.");
    } finally {
      setVoidLoading(false);
    }
  };

  const openExpire = (sale: Sale) => {
    setExpireReason("");
    setExpireTarget(sale);
  };

  const confirmExpire = async () => {
    if (!expireTarget) return;
    setExpireLoading(true);
    try {
      await expireSaleApi(
        expireTarget.id,
        expireReason.trim() || "Dikedaluwaskan manual oleh admin.",
      );
      toast.success(
        `Transaksi ${expireTarget.sale_code} berhasil dikedaluwaskan.`,
      );
      setExpireTarget(null);
      setDetail(null);
      load();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message || "Gagal mengedaluwaskan transaksi.");
    } finally {
      setExpireLoading(false);
    }
  };

  // Helper config ikon dinamis berdasarkan status
  const getStatusIconConfig = (status: string) => {
    switch (status) {
      case "PAID":
        return {
          bg: "bg-blue-50 text-blue-600 border-blue-100",
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          ),
        };
      case "PENDING":
        return {
          bg: "bg-amber-50 text-amber-600 border-amber-100",
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
        };
      case "VOID":
      case "EXPIRED":
        return {
          bg: "bg-red-50 text-red-600 border-red-100",
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
        };
      default:
        return {
          bg: "bg-slate-50 text-slate-600 border-slate-200",
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
        };
    }
  };

  const columns: Column<Sale>[] = [
    {
      key: "no",
      label: "No.",
      className: "w-12 text-center",
      render: (r) => {
        const rowIndex = data.findIndex((item) => item.id === r.id);
        return (
          <span className="text-slate-500 font-medium text-xs">
            {(page - 1) * 10 + (rowIndex !== -1 ? rowIndex + 1 : 1)}
          </span>
        );
      },
    },
    {
      key: "sale_code",
      label: "Kode Transaksi",
      render: (r) => {
        const config = getStatusIconConfig(r.status);
        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm ${config.bg}`}
            >
              {config.icon}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{r.sale_code}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(r.sale_code);
                  toast.success("Kode transaksi disalin!");
                }}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium mt-0.5"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                  />
                </svg>
                Salin
              </button>
            </div>
          </div>
        );
      },
    },
    {
      key: "paid_at",
      label: "Tanggal & Waktu",
      render: (r) => {
        let dateToShow: string | null = null;
        
        // Pilih tanggal berdasarkan status
        if (r.status === "PAID" && r.paid_at) {
          dateToShow = r.paid_at;
        } else if (r.status === "VOID" && r.voided_at) {
          dateToShow = r.voided_at;
        } else if (r.created_at) {
          dateToShow = r.created_at;
        }

        if (!dateToShow) {
          return <span className="text-slate-400">-</span>;
        }

        const formatted = formatDateTime(dateToShow);
        const parts = formatted.includes(",")
          ? formatted.split(",")
          : [formatted, ""];
        const datePart = parts[0].trim();
        const timePart = parts[1] ? parts[1].trim() : "";

        return (
          <div className="text-slate-600 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <svg
                className="h-4 w-4 text-slate-400 shrink-0"
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
              <span className="font-medium text-slate-700">{datePart}</span>
            </div>
            {timePart && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <svg
                  className="h-3.5 w-3.5 text-slate-400 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{timePart}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-2">
          <SaleStatusBadge status={r.status} />
          {r.status === "PENDING" && r.payment_expires_at && (
            <CountdownBadge
              expiresAt={r.payment_expires_at}
              onExpired={() => load()}
            />
          )}
        </div>
      ),
    },
    {
      key: "actions",
      label: "Aksi",
      className: "text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDetail(r)}
            className="text-slate-700 border border-slate-200 hover:bg-slate-50"
          >
            Detail
          </Button>
          {r.status === "PENDING" && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/pos?resume_payment=${r.id}`)}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              Lanjutkan Pembayaran
            </Button>
          )}
          {r.status === "PAID" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openReceipt(r)}
              className="text-blue-600 border border-blue-200 bg-blue-50/50 hover:bg-blue-50"
            >
              Cetak Struk
            </Button>
          )}
          {isAdmin && r.status === "PAID" && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => openVoid(r)}
              className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            >
              Void
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 px-2 sm:px-4 md:px-6 py-4 max-w-7xl mx-auto">
      <Card className="mb-4 bg-white border border-slate-200 shadow-sm p-3 sm:p-4 rounded-xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
            <div className="w-full sm:w-80">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Cari kode transaksi..."
              />
            </div>
            <div className="w-full sm:w-48">
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "Semua Status" },
                  ...(["PENDING", "PAID", "EXPIRED", "VOID"] as const).map(
                    (s) => ({
                      value: s,
                      label: SALE_STATUS_LABEL[s],
                    }),
                  ),
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data.length === 0 ? (
        <Card className="bg-white border border-slate-200 rounded-xl p-6">
          <EmptyState
            title="Belum ada transaksi"
            description="Transaksi yang dibuat lewat POS akan muncul di sini."
          />
        </Card>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Desktop table */}
            <div className="hidden lg:block">
              <DataTable
                columns={columns}
                data={data}
                keyExtractor={(r) => r.id}
              />
            </div>

            {/* Mobile & Tablet Card Layout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden p-3 sm:p-4 bg-slate-50/50">
              {data.map((s, index) => {
                const formatted = s.paid_at ? formatDateTime(s.paid_at) : "-";
                const parts = formatted.includes(",")
                  ? formatted.split(",")
                  : [formatted, ""];
                const datePart = parts[0].trim();
                const timePart = parts[1] ? parts[1].trim() : "";
                const config = getStatusIconConfig(s.status);
                const itemNo = (page - 1) * 10 + index + 1;

                return (
                  <div
                    key={s.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-sm ${config.bg}`}
                          >
                            {config.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-400">
                                #{itemNo}
                              </span>
                              <p className="text-sm font-semibold text-slate-900">
                                {s.sale_code}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(s.sale_code);
                                toast.success("Kode transaksi disalin!");
                              }}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium mt-0.5"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                />
                              </svg>
                              Salin
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <SaleStatusBadge status={s.status} />
                          {s.status === "PENDING" && s.payment_expires_at && (
                            <CountdownBadge
                              expiresAt={s.payment_expires_at}
                              onExpired={() => load()}
                            />
                          )}
                        </div>
                      </div>

                      <div className="py-2 text-xs text-slate-600 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-500">
                            Tanggal:
                          </span>
                          <span className="text-slate-800">{datePart}</span>
                        </div>
                        {timePart && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-500">
                              Waktu:
                            </span>
                            <span className="text-slate-800">
                              {timePart} WIB
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDetail(s)}
                        className="border border-slate-200 text-slate-700 text-xs px-2.5 py-1"
                      >
                        Detail
                      </Button>
                      {s.status === "PENDING" && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() =>
                            navigate(`/pos?resume_payment=${s.id}`)
                          }
                          className="bg-blue-600 text-white text-xs px-2.5 py-1"
                        >
                          Lanjutkan
                        </Button>
                      )}
                      {s.status === "PAID" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openReceipt(s)}
                          className="border border-blue-200 text-blue-600 bg-blue-50/50 text-xs px-2.5 py-1"
                        >
                          Cetak
                        </Button>
                      )}
                      {isAdmin && s.status === "PAID" && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => openVoid(s)}
                          className="bg-red-50 text-red-600 border border-red-200 text-xs px-2.5 py-1"
                        >
                          Void
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Footer dengan Tombol Angka (1, 2, 3...) */}
            <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-4 border-t border-slate-200 bg-white gap-4">
              <div className="text-xs sm:text-sm text-slate-500 font-medium text-center sm:text-left">
                Menampilkan{" "}
                <span className="font-semibold text-slate-800">
                  {data.length > 0 ? (page - 1) * 10 + 1 : 0}
                </span>{" "}
                -{" "}
                <span className="font-semibold text-slate-800">
                  {Math.min(page * 10, total)}
                </span>{" "}
                dari{" "}
                <span className="font-semibold text-slate-800">{total}</span>{" "}
                transaksi
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="border border-slate-300 text-slate-700 text-xs h-8 px-3 disabled:opacity-50"
                >
                  Sebelumnya
                </Button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: lastPage }, (_, i) => i + 1).map(
                    (num) => {
                      if (
                        num === 1 ||
                        num === lastPage ||
                        (num >= page - 1 && num <= page + 1)
                      ) {
                        return (
                          <button
                            key={num}
                            onClick={() => setPage(num)}
                            className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center ${
                              page === num
                                ? "bg-blue-600 text-white shadow-sm"
                                : "border border-slate-200 text-slate-700 hover:bg-slate-50 bg-white"
                            }`}
                          >
                            {num}
                          </button>
                        );
                      } else if (num === page - 2 || num === page + 2) {
                        return (
                          <span key={num} className="text-slate-400 px-1">
                            ...
                          </span>
                        );
                      }
                      return null;
                    },
                  )}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= lastPage}
                  onClick={() => setPage((p) => Math.min(p + 1, lastPage))}
                  className="border border-slate-300 text-slate-700 text-xs h-8 px-3 disabled:opacity-50"
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Detail Transaksi */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title=""
        size="md"
        hideScrollbar={true}
      >
        {detail && (
          <div className="space-y-3 px-1 pb-1">
            {/* Header Modal dengan Ikon Standar */}
            <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Detail Transaksi
                </h2>
                <p className="text-xs text-slate-500">
                  Informasi lengkap transaksi #{detail.sale_code}
                </p>
              </div>
            </div>

            {/* Kotak Informasi Utama */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm space-y-3 text-xs">
              {/* Baris 1: Kode, Tanggal, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">
                    Kode Transaksi
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900">
                      {detail.sale_code}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(detail.sale_code);
                        toast.success("Kode transaksi disalin!");
                      }}
                      className="text-blue-600 hover:text-blue-700 p-0.5 inline-flex items-center"
                      title="Salin Kode"
                    >
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">Tanggal</p>
                  <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                    <svg
                      className="h-3.5 w-3.5 text-slate-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        x="3"
                        y="4"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      ></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>
                      {detail.paid_at ? formatDateTime(detail.paid_at) : "-"}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">Status</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <SaleStatusBadge status={detail.status} />
                    {detail.status === "PENDING" &&
                      detail.payment_expires_at && (
                        <CountdownBadge
                          expiresAt={detail.payment_expires_at}
                          onExpired={() => load()}
                        />
                      )}
                  </div>
                </div>
              </div>

              {/* Garis Pemisah Tipis */}
              <div className="border-t border-slate-100"></div>

              {/* Baris 2: Metode Pembayaran, Kasir, Pelanggan */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">
                    Metode Pembayaran
                  </p>
                  <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                    <svg
                      className="h-3.5 w-3.5 text-slate-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        x="2"
                        y="5"
                        width="20"
                        height="14"
                        rx="2"
                        ry="2"
                      ></rect>
                      <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span>
                      {detail.payment_method
                        ? PAYMENT_LABEL[detail.payment_method]
                        : "-"}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">Kasir</p>
                  <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                    <svg
                      className="h-3.5 w-3.5 text-slate-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span>{detail.cashier?.name || "-"}</span>
                  </div>
                </div>
                <div>
                  <p className="text-slate-400 font-medium mb-0.5">Pelanggan</p>
                  <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                    <svg
                      className="h-3.5 w-3.5 text-slate-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span>{detail.customer?.name || "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Banner Alert Status */}
            {detail.status === "VOID" && (
              <div className="rounded-xl bg-red-50/80 border border-red-200 p-2.5 text-xs text-red-800 space-y-0.5 shadow-sm">
                <div className="flex items-center gap-1.5 font-semibold">
                  <svg
                    className="h-4 w-4 text-red-600 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span>Transaksi ini dibatalkan oleh sistem</span>
                </div>
                <p className="text-red-600 pl-5.5">
                  Dibatalkan: {detail.void_reason}{" "}
                  {detail.voided_at && `· ${formatDateTime(detail.voided_at)}`}
                </p>
              </div>
            )}

            {detail.status === "PENDING" && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 flex items-center gap-1.5 shadow-sm">
                <svg
                  className="h-4 w-4 text-amber-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>
                  Pembayaran masih menunggu. Silakan lanjutkan pembayaran atau
                  tunggu hingga kedaluwarsa.
                </span>
              </div>
            )}

            {detail.status === "EXPIRED" && (
              <div className="rounded-xl bg-slate-100 border border-slate-200 p-2.5 text-xs text-slate-600 flex items-center gap-1.5 shadow-sm">
                <svg
                  className="h-4 w-4 text-slate-500 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>
                  Pembayaran kedaluwarsa. Stok telah dikembalikan otomatis.
                </span>
              </div>
            )}

            {/* Bagian Rincian Pembayaran (Tabel Produk) */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
                Rincian Pembayaran
              </h3>

              {detailLoading ? (
                <LoadingState />
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2 w-10">No.</th>
                        <th className="px-3.5 py-2">Produk / Layanan</th>
                        <th className="px-3.5 py-2 text-center w-12">Qty</th>
                        <th className="px-3.5 py-2 text-right w-28">
                          Harga Satuan
                        </th>
                        <th className="px-3.5 py-2 text-right w-28">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {(detail.items || []).map((item, index) => (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-3.5 py-2 text-slate-500">
                            {index + 1}
                          </td>
                          <td className="px-3.5 py-2 font-medium text-slate-900">
                            {item.item_name_snapshot}
                          </td>
                          <td className="px-3.5 py-2 text-center">
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="px-3.5 py-2 text-right">
                            {formatRupiah(item.unit_price)}
                          </td>
                          <td className="px-3.5 py-2 text-right font-semibold">
                            {formatRupiah(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Ringkasan Bawah Tabel */}
                  <div className="border-t border-slate-200 bg-white p-3 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span className="font-medium text-slate-800">
                        {formatRupiah(detail.subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Diskon</span>
                      <span className="font-medium text-slate-800">
                        {formatRupiah(detail.discount_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-blue-50/60 border border-blue-100 px-3.5 py-2 rounded-lg text-xs font-bold text-slate-900 mt-1">
                      <span>Total</span>
                      <span className="text-blue-600 text-sm">
                        {formatRupiah(detail.grand_total)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
              <div>
                {detail.status === "PAID" && (
                  <Button
                    variant="secondary"
                    onClick={() => openReceipt(detail)}
                    className="border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 flex items-center gap-1.5 text-xs font-medium shadow-sm h-8 px-3"
                  >
                    <svg
                      className="h-3.5 w-3.5 text-slate-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                      />
                    </svg>
                    Cetak Struk
                  </Button>
                )}
                {detail.status === "PENDING" && isAdmin && (
                  <Button
                    variant="danger"
                    onClick={() => openExpire(detail)}
                    className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 text-xs h-8 px-3"
                  >
                    Kedaluwaskan
                  </Button>
                )}
                {isAdmin && detail.status === "PAID" && (
                  <Button
                    variant="danger"
                    onClick={() => openVoid(detail)}
                    className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 text-xs h-8 px-3"
                  >
                    Void Transaksi
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {detail.status === "PENDING" && (
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/pos?resume_payment=${detail.id}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs h-8 px-3"
                  >
                    Lanjutkan Pembayaran
                  </Button>
                )}
                <Button
                  onClick={() => setDetail(null)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-1.5 rounded-lg text-xs shadow-sm h-8"
                >
                  Tutup
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!voidTarget}
        title={`Void Transaksi ${voidTarget?.sale_code ?? ""}?`}
        message="Stok sparepart dari transaksi ini akan dikembalikan. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Void Transaksi"
        danger
        loading={voidLoading}
        onConfirm={confirmVoid}
        onCancel={() => setVoidTarget(null)}
        extra={
          <Input
            label="Alasan"
            name="void_reason"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Contoh: Pelanggan salah bayar"
          />
        }
      />

      <ConfirmDialog
        open={!!expireTarget}
        title={`Kedaluwaskan Transaksi ${expireTarget?.sale_code ?? ""}?`}
        message="Pembayaran akan dikedaluwaskan dan stok sparepart akan dikembalikan. Transaksi tidak dapat dilanjutkan lagi."
        confirmLabel="Kedaluwaskan"
        danger
        loading={expireLoading}
        onConfirm={confirmExpire}
        onCancel={() => setExpireTarget(null)}
        extra={
          <Input
            label="Alasan (opsional)"
            name="expire_reason"
            value={expireReason}
            onChange={(e) => setExpireReason(e.target.value)}
            placeholder="Contoh: Pelanggan tidak membayar hingga batas waktu"
          />
        }
      />
    </div>
  );
}
