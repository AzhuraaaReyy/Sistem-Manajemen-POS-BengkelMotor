import { useEffect, useState, useCallback, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getSaleApi, expireSaleApi } from "@/lib/api/sales";
import { simulatePaymentApi } from "@/lib/api/payments";
import { formatRupiah } from "@/lib/formatters";
import { Copy, Clock, CheckCircle, XCircle, CreditCard, Loader2, Shield, Check, XCircle as XCircleIcon, AlertCircle, Info } from "lucide-react";
import QRCode from "react-qr-code";
import { useToast } from "@/components/ui/Toast";

interface Props {
  sale: any;
  onPaid: (sale: any) => void;
  onExpired: () => void;
  onClose: () => void;
}

export function WaitingPaymentModal({ sale, onPaid, onExpired, onClose }: Props) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [status, setStatus] = useState(sale.status);
  const [simulating, setSimulating] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [qrError, setQrError] = useState(false);
  const toast = useToast();
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus management for accessibility
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    modalContentRef.current?.focus();
    return () => {
      previousActiveElement.current?.focus();
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!sale.payment_expires_at) return;
    const expires = new Date(sale.payment_expires_at).getTime();
    const tick = async () => {
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setStatus("EXPIRED");
        try {
          await expireSaleApi(sale.id, "Waktu pembayaran habis (10 menit)");
        } catch {
          // Silent fail - cron job will handle it
        }
        onExpired();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sale.payment_expires_at, sale.id, onExpired]);

  // Poll for payment status
  useEffect(() => {
    if (status !== "PENDING") return;
    const poll = setInterval(async () => {
      try {
        const res = await getSaleApi(sale.id);
        if (res.status === "PAID") {
          setStatus("PAID");
          onPaid(res);
        } else if (res.status === "EXPIRED") {
          setStatus("EXPIRED");
          onExpired();
        }
      } catch {
        return;
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [sale.id, status, onPaid, onExpired]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = timeLeft / (10 * 60);
  const isWarning = timeLeft <= 180;

  const copyVa = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(sale.gateway_va_number || "");
      setCopyFeedback(true);
      toast.success("Nomor VA disalin");
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      toast.error("Gagal menyalin");
    }
  }, [sale.gateway_va_number, toast]);

  const handleSimulatePayment = useCallback(async () => {
    if (simulating) return;
    setSimulating(true);
    try {
      await simulatePaymentApi(sale.sale_code);
      const res = await getSaleApi(sale.id);
      if (res.status === "PAID") {
        setStatus("PAID");
        onPaid(res);
      }
    } catch (err) {
      toast.error("Gagal mensimulasikan pembayaran");
    } finally {
      setSimulating(false);
    }
  }, [sale, simulating, toast, onPaid]);

  const handleQrError = useCallback(() => setQrError(true), []);

  const statusConfig = {
    PENDING: {
      icon: Clock,
      color: "bg-primary/10 text-primary border-primary/20",
      iconColor: "text-primary",
      label: "Menunggu Pembayaran",
      description: "Pelanggan sedang melakukan pembayaran",
      badgeTone: "warning" as const,
    },
    PAID: {
      icon: CheckCircle,
      color: "bg-success/10 text-success border-success/20",
      iconColor: "text-success",
      label: "Pembayaran Berhasil",
      description: "Transaksi telah dibayar dan dicatat",
      badgeTone: "success" as const,
    },
    EXPIRED: {
      icon: XCircleIcon,
      color: "bg-destructive/10 text-destructive border-destructive/20",
      iconColor: "text-destructive",
      label: "Pembayaran Kedaluwarsa",
      description: "Waktu habis, stok dikembalikan otomatis",
      badgeTone: "danger" as const,
    },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
  const StatusIcon = config.icon;

  return (
    <Modal open onClose={onClose} title="Konfirmasi Pembayaran" size="lg">
      <div className="space-y-5" role="status" aria-live="polite" aria-atomic="true">
        {/* Status Header */}
        <div className="flex items-center gap-3 p-4 rounded-xl border" style={{ backgroundColor: `var(--color-${status === "PAID" ? "success" : status === "EXPIRED" ? "destructive" : "primary"})/5` }}>
          <div className="flex-shrink-0 p-2 rounded-lg" style={{ backgroundColor: `var(--color-${status === "PAID" ? "success" : status === "EXPIRED" ? "destructive" : "primary"})/15` }}>
            <StatusIcon className="h-6 w-6" style={{ color: `var(--color-${status === "PAID" ? "success" : status === "EXPIRED" ? "destructive" : "primary"})` }} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900" style={{ color: `var(--color-${status === "PAID" ? "success" : status === "EXPIRED" ? "destructive" : "primary"})` }}>
              {config.label}
            </h2>
            <p className="text-sm text-gray-500 truncate">{config.description}</p>
          </div>
          <Badge tone={config.badgeTone} className="flex-shrink-0">
            {status}
          </Badge>
        </div>

        {/* Sale Code & Amount */}
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50">
            <span className="text-sm text-gray-500">Kode Transaksi</span>
            <code className="font-mono text-sm text-gray-900 px-2 py-1 rounded bg-white border">{sale.sale_code}</code>
          </div>
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-1">Total Tagihan</p>
            <p className="text-3xl md:text-4xl font-bold tabular-nums text-gray-900" style={{ fontFamily: '"Poppins", "Open Sans", sans-serif' }}>
              {formatRupiah(sale.grand_total)}
            </p>
          </div>
        </div>

        {/* Countdown Timer */}
        {status === "PENDING" && (
          <div className="space-y-3 p-4 rounded-xl border border-gray-100 bg-gray-50" aria-live="polite" aria-atomic="true">
            <div className="flex items-center justify-center gap-2">
              <Clock className="h-5 w-5" style={{ color: isWarning ? "var(--color-warning)" : "var(--color-primary)" }} aria-hidden="true" />
              <span className="text-xl md:text-2xl font-mono font-bold tabular-nums" style={{ color: isWarning ? "var(--color-warning)" : "var(--color-primary)" }}>
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Waktu tersisa pembayaran">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${progress * 100}%`,
                  backgroundColor: isWarning ? "var(--color-warning)" : "var(--color-primary)",
                }}
              />
            </div>
            <p className="text-xs text-center text-gray-500">
              Sisa waktu sebelum kedaluwarsa ({isWarning ? "kurang dari 3 menit" : "masih cukup waktu"})
            </p>
          </div>
        )}

        {/* Payment Method Content */}
        {status === "PENDING" && sale.payment_method === "QRIS" && (
          <div className="space-y-4" aria-labelledby="qris-heading">
            <h3 id="qris-heading" className="sr-only">QRIS Payment</h3>
            <div className="text-center space-y-3">
              <div className="inline-flex flex-col items-center gap-3">
                <div
                  className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm"
                  role="img"
                  aria-label="QRIS Payment Code"
                >
                  {!qrError && sale.gateway_qr_string ? (
                    <QRCode
                      value={sale.gateway_qr_string}
                      size={200}
                      className="w-[160px] h-[160px] md:w-[200px] md:h-[200px]"
                      bgColor="#FFFFFF"
                      fgColor="#111827"
                      level="M"
                    />
                  ) : sale.gateway_qr_url ? (
                    <img
                      src={sale.gateway_qr_url}
                      alt="QRIS Payment Code untuk pembayaran"
                      className="h-[160px] w-[160px] md:h-[200px] md:w-[200px] object-contain"
                      onError={handleQrError}
                    />
                  ) : qrError ? (
                    <div className="w-[160px] h-[160px] flex flex-col items-center justify-center gap-2 bg-gray-50 rounded-lg border border-gray-200">
                      <AlertCircle className="h-10 w-10 text-gray-400" aria-hidden="true" />
                      <p className="text-sm text-gray-500">QR Code tidak tersedia</p>
                    </div>
                  ) : (
                    <div className="w-[160px] h-[160px] flex flex-col items-center justify-center gap-2 bg-gray-50 rounded-lg border border-gray-200">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
                      <p className="text-sm text-gray-500">Memuat QR Code...</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="h-4 w-4 text-green-500" aria-hidden="true" />
                  <span>Transaksi aman & terenkripsi</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Buka aplikasi GoPay / e-wallet / mobile banking lalu scan QRIS di atas
              </p>
              {import.meta.env.DEV && (
                <Button
                  onClick={handleSimulatePayment}
                  disabled={simulating}
                  className="w-full mt-2 flex items-center justify-center gap-2"
                  variant="secondary"
                >
                  {simulating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Mensimulasikan...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      Simulasi Bayar (Dev)
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {status === "PENDING" && sale.payment_method === "VA" && (
          <div className="space-y-4" aria-labelledby="va-heading">
            <h3 id="va-heading" className="sr-only">Virtual Account Payment</h3>
            <div className="text-center space-y-3">
              <Info className="mx-auto h-12 w-12 text-primary/60" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Nomor Virtual Account</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-xl md:text-2xl font-mono font-bold text-gray-900 tracking-wider break-all bg-gray-50 px-4 py-3 rounded-lg border border-gray-200 min-w-[200px]">
                    {sale.gateway_va_number}
                  </span>
                  <Button
                    onClick={copyVa}
                    disabled={copyFeedback}
                    variant="ghost"
                    size="sm"
                    className="h-10"
                    aria-label={copyFeedback ? "Disalin" : "Salin nomor VA"}
                  >
                    {copyFeedback ? (
                      <Check className="h-5 w-5 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-5 w-5" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                {copyFeedback && (
                  <p className="text-xs text-success flex items-center justify-center gap-1">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Nomor VA berhasil disalin
                  </p>
                )}
              </div>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Bayar lewat ATM / mobile banking / internet banking menggunakan nomor di atas
              </p>
            </div>
          </div>
        )}

        {/* Success State */}
        {status === "PAID" && (
          <div className="text-center space-y-3 py-4" role="status" aria-live="polite">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-10 w-10 text-success" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Pembayaran Berhasil</h3>
            <p className="text-sm text-gray-500">Transaksi telah dibayar dan dicatat secara otomatis</p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 text-success text-sm font-medium">
              <Check className="h-4 w-4" aria-hidden="true" />
              Selesai
            </div>
          </div>
        )}

        {/* Expired State */}
        {status === "EXPIRED" && (
          <div className="text-center space-y-3 py-4" role="alert" aria-live="assertive">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Pembayaran Kedaluwarsa</h3>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              Waktu pembayaran (10 menit) telah habis. Stok telah dikembalikan otomatis.
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium">
              <XCircleIcon className="h-4 w-4" aria-hidden="true" />
              Kedaluwarsa
            </div>
          </div>
        )}

        {/* Info Footer */}
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1.5">
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Jendela bisa ditutup; tagihan tetap berjalan dan bisa dicek di Riwayat Transaksi.</span>
          </p>
        </div>

        {/* Close Action */}
        <div className="pt-2">
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full"
            size="md"
            aria-label="Tutup modal pembayaran"
          >
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}