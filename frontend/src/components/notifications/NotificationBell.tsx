import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { BellIcon, CloseIcon } from "@/components/shared/icons";
import { useNotifications } from "@/lib/useNotifications";
import type { Notification } from "@/types";
import { NotificationSection } from "./NotificationSection";

export function NotificationBell() {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCounts,
    loading,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "semua" | "peringatan" | "transaksi"
  >("semua");

  const stockNotifications = notifications.filter((n) => n.type === "STOCK");
  const transactionNotifications = notifications.filter(
    (n) => n.type === "TRANSACTION",
  );

  const hasUnread = unreadCounts.total > 0;
  const hasMarkableUnread = unreadCounts.transaction > 0;

  const handleBellClick = () => setOpen((v) => !v);

  const handleMarkAllAsRead = async () => {
    await markAllAsRead();
  };

  const handleNavigate = (n: Notification) => {
    const actionUrl = (n.data as { action_url?: string } | undefined)?.action_url;
    const fallback =
      n.type === "STOCK"
        ? "/produk"
        : n.type === "TRANSACTION"
          ? "/riwayat"
          : "/whatsapp-chats";
    setOpen(false);
    navigate(actionUrl || fallback);
  };

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    const fastPoll = setInterval(refresh, 5000);

    return () => {
      document.removeEventListener("keydown", onKey);
      clearInterval(fastPoll);
    };
  }, [open, refresh]);

  return (
    <>
      {/* Tombol Lonceng di Sidebar Kiri */}
      <button
        type="button"
        className="relative rounded-full bg-slate-100 p-2 text-slate-600 transition-colors hover:bg-slate-200"
        onClick={handleBellClick}
        aria-label={`Notifikasi: ${unreadCounts.total} belum dibaca`}
      >
        <BellIcon className="h-5 w-5" />
        {hasUnread && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCounts.total}
          </span>
        )}
      </button>

      {/* Pop-up Responsive Portal */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-start sm:justify-end">
            {/* Backdrop Overlay */}
            <div
              className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] transition-opacity"
              onClick={() => setOpen(false)}
            />

            {/* Pop-up Card Responsif:
                - Mobile: Bottom Sheet (menempel di bawah dengan rounded top)
                - Tablet/Desktop (sm & lg): Melayang rapi di kanan atas, pas selebar area cart
            */}
            <div className="relative z-10 flex w-full max-w-[360px] max-h-[85vh] sm:max-h-[calc(100vh-2rem)] flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl border border-slate-200/80 overflow-hidden sm:m-4 animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-3.5 pb-2 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900">Notifikasi</h2>
                <div className="flex items-center gap-2">
                  {hasMarkableUnread && (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Tandai semua dibaca
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Tab Filter */}
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 text-xs font-medium text-slate-500 bg-white">
                <button
                  type="button"
                  onClick={() => setActiveTab("semua")}
                  className={`pb-2 pt-2 text-[11px] transition-all ${
                    activeTab === "semua"
                      ? "border-b-2 border-blue-600 font-bold text-blue-600"
                      : "hover:text-slate-800"
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("peringatan")}
                  className={`flex items-center gap-1 pb-2 pt-2 text-[11px] transition-all ${
                    activeTab === "peringatan"
                      ? "border-b-2 border-blue-600 font-bold text-blue-600"
                      : "hover:text-slate-800"
                  }`}
                >
                  <span>Peringatan</span>
                  {unreadCounts.stock > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-700">
                      {unreadCounts.stock}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("transaksi")}
                  className={`flex items-center gap-1 pb-2 pt-2 text-[11px] transition-all ${
                    activeTab === "transaksi"
                      ? "border-b-2 border-blue-600 font-bold text-blue-600"
                      : "hover:text-slate-800"
                  }`}
                >
                  <span>Transaksi</span>
                  {unreadCounts.transaction > 0 && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700">
                      {unreadCounts.transaction}
                    </span>
                  )}
                </button>
              </div>

              {/* List Notifikasi */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50 hide-scrollbar">
                {loading && notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Memuat notifikasi...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Belum ada notifikasi.
                  </div>
                ) : (
                  <>
                    {(activeTab === "semua" || activeTab === "peringatan") && (
                      <NotificationSection
                        title="Peringatan Stok"
                        type="STOCK"
                        notifications={
                          activeTab === "semua"
                            ? stockNotifications.slice(0, 3)
                            : stockNotifications
                        }
                        onMarkAsRead={markAsRead}
                        onNavigate={handleNavigate}
                        onViewAll={() => setActiveTab("peringatan")}
                        isTabSemua={activeTab === "semua"}
                        emptyMessage="Stok aman"
                      />
                    )}

                    {(activeTab === "semua" || activeTab === "transaksi") && (
                      <NotificationSection
                        title="Transaksi Terbaru"
                        type="TRANSACTION"
                        notifications={
                          activeTab === "semua"
                            ? transactionNotifications.slice(0, 3)
                            : transactionNotifications
                        }
                        onMarkAsRead={markAsRead}
                        onNavigate={handleNavigate}
                        onViewAll={() => setActiveTab("transaksi")}
                        isTabSemua={activeTab === "semua"}
                        emptyMessage="Belum ada transaksi terbaru"
                      />
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              {/* Footer Dynamic Based on Active Tab */}
              <div className="border-t border-slate-100 bg-white py-2.5 px-3 text-center shrink-0">
                {activeTab === "peringatan" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate("/produk"); // Sesuaikan rute ke halaman stok / inventaris Anda
                    }}
                    className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700"
                  >
                    Kelola Stok Sekarang
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate("/riwayat");
                    }}
                    className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Lihat Riwayat Transaksi
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
