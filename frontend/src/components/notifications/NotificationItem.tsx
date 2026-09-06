import type { Notification } from "@/types";

interface Props {
  notification: Notification;
  onMarkAsRead: (id: number) => void;
}

export function NotificationItem({ notification, onMarkAsRead }: Props) {
  const isUnread = !notification.read_at;
  const timeAgo = getTimeAgo(notification.created_at);

  // Mengambil gambar dari berbagai kemungkinan properti dari backend
  const imageUrl =
    notification.product_image ||
    notification.image ||
    (notification as any).product?.image ||
    (notification as any).data?.product_image ||
    (notification as any).data?.image;

  // Mendapatkan ikon berdasarkan tipe dan judul/pesan (misal: kedaluwarsa, batal/void, sukses)
  const icon = getIcon(
    notification.type,
    notification.title,
    notification.message,
  );

  return (
    <button
      type="button"
      onClick={() => isUnread && onMarkAsRead(notification.id)}
      className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${
        isUnread
          ? "bg-blue-50/30 hover:bg-blue-50/60"
          : "bg-white hover:bg-slate-50"
      }`}
    >
      {/* 
        CONTAINER GAMBAR / BADGE:
        - Jika imageUrl ada -> Tampilkan foto produk dari backend
        - Jika imageUrl kosong / gagal dimuat -> Tampilkan badge icon default sesuai status
      */}
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg flex items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={notification.title}
            className="h-full w-full object-cover rounded-lg border border-slate-100"
            onError={(e) => {
              // Jika URL gambar rusak (404), sembunyikan <img> dan tampilkan badge icon default
              const imgElement = e.target as HTMLImageElement;
              imgElement.style.display = "none";
              const parent = imgElement.parentElement;
              if (parent) {
                parent.className = `flex h-full w-full items-center justify-center rounded-lg ${icon.bgColor} ${icon.color}`;
                parent.innerHTML = `<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">${getIconSvgPath(notification.type, notification.title, notification.message)}</svg>`;
              }
            }}
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center rounded-lg ${icon.bgColor} ${icon.color}`}
          >
            {icon.element}
          </div>
        )}
      </div>

      {/* Detail Teks Notifikasi */}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-xs ${
            isUnread
              ? "font-bold text-slate-900"
              : "font-semibold text-slate-700"
          }`}
        >
          {notification.title}
        </p>
        <p className="line-clamp-1 text-[11px] text-slate-500">
          {notification.message}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-400">{timeAgo}</p>
      </div>

      {/* Panah Navigasi Kanan */}
      <div className="shrink-0 text-slate-300">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
}

function getIconSvgPath(
  type: string,
  title: string = "",
  message: string = "",
): string {
  const lowerText = (title + " " + message).toLowerCase();

  if (type === "STOCK") {
    return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />';
  }

  if (type === "TRANSACTION") {
    if (
      lowerText.includes("kedaluwarsa") ||
      lowerText.includes("batal") ||
      lowerText.includes("void") ||
      lowerText.includes("expired")
    ) {
      return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />';
    }
    return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />';
  }

  return '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />';
}

function getIcon(type: string, title: string = "", message: string = "") {
  const lowerText = (title + " " + message).toLowerCase();

  switch (type) {
    case "STOCK":
      return {
        color: "text-amber-600",
        bgColor: "bg-amber-100",
        element: (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        ),
      };
    case "TRANSACTION":
      // Cek apakah transaksi kedaluwarsa, batal, atau void
      if (
        lowerText.includes("kedaluwarsa") ||
        lowerText.includes("batal") ||
        lowerText.includes("void") ||
        lowerText.includes("expired")
      ) {
        return {
          color: "text-red-600",
          bgColor: "bg-red-100",
          element: (
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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
      }
      // Transaksi sukses / paid
      return {
        color: "text-emerald-600",
        bgColor: "bg-emerald-100",
        element: (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ),
      };
    default:
      return {
        color: "text-sky-600",
        bgColor: "bg-sky-100",
        element: (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
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
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Baru saja";
  if (diffMins < 60) return `${diffMins} menit yang lalu`;
  if (diffHours < 24) return `${diffHours} jam yang lalu`;
  return `${diffDays} hari yang lalu`;
}
