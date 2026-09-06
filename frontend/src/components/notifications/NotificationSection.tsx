import { useState } from "react";
import type { Notification } from "@/types";
import { NotificationItem } from "./NotificationItem";

interface Props {
  title: string;
  notifications: Notification[];
  onMarkAsRead: (id: number) => void;
  onViewAll?: () => void;
  onNavigate?: (n: Notification) => void;
  isTabSemua?: boolean;
  emptyMessage?: string;
  type?: "STOCK" | "TRANSACTION" | "SYSTEM";
}

export function NotificationSection({
  title,
  notifications,
  onMarkAsRead,
  onViewAll,
  onNavigate,
  isTabSemua = false,
  emptyMessage = "Tidak ada notifikasi",
  type = "STOCK",
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const isStock = type === "STOCK";

  const getSectionIcon = () => {
    if (isStock) {
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500 text-white">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </span>
      );
    }

    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-500 text-white">
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </span>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xs">
      {/* Header Accordion */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between bg-slate-50/80 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-100/80"
      >
        <div className="flex items-center gap-2">
          {getSectionIcon()}
          <span className="text-xs font-bold text-slate-800">{title}</span>
          {notifications.length > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                isStock
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {notifications.length}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Konten Accordion */}
      {expanded && (
        <div className="divide-y divide-slate-100 bg-white">
          {notifications.length === 0 ? (
            <p className="px-4 py-4 text-center text-[11px] text-slate-400">
              {emptyMessage}
            </p>
          ) : (
            <>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={onMarkAsRead}
                  onClick={onNavigate}
                />
              ))}

              {/* Tombol Footer per Seksi */}
              {isTabSemua && onViewAll && (
                <div className="p-2.5 bg-white">
                  <button
                    type="button"
                    onClick={onViewAll}
                    className="w-full rounded-xl border border-blue-100 bg-blue-50/40 py-2 text-center text-[11px] font-bold text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    Lihat semua {title.toLowerCase()}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
