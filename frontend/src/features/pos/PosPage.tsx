import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PaymentMethodSelector } from "@/features/pos/PaymentMethodSelector";
import { useToast } from "@/components/ui/Toast";
import { getProductsApi } from "@/lib/api/products";
import { getServicesApi } from "@/lib/api/services";
import { getCustomersApi } from "@/lib/api/customers";
import {
  checkoutSaleApi,
  createSaleApi,
  getSaleApi,
  voidSaleApi,
  type CreateSalePayload,
} from "@/lib/api/sales";
import { simulatePaymentApi } from "@/lib/api/payments";
import { useNotifications } from "@/lib/useNotifications";
import { formatRupiah, formatNumber } from "@/lib/formatters";
import { PAYMENT_METHODS } from "@/lib/constants";
import { CustomerSelector } from "@/features/pos/CustomerSelector";
import { usePos } from "@/features/pos/PosContext";
import { RightCartSidebar } from "@/features/pos/RightCartSidebar";
import ilustrasi from "../../app/assets/ilustrasi.png";
import type { Product, Service, Customer, PaymentMethod, Sale } from "@/types";
import QRCode from "react-qr-code";
import {
  Search,
  ArrowRight,
  Wallet,
  CheckCircle2,
  ChevronDown,
  Printer,
  Clock,
  Shield,
  Loader2,
  Info,
  XCircle,
} from "lucide-react";

export function PosPage() {
  const toast = useToast();
  const { refresh: refreshNotifications } = useNotifications();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    cart,
    setCart,
    discount,
    grandTotal,
    addProduct,
    addService,
    checkoutOpen,
    setCheckoutOpen,
  } = usePos();

  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "ALL" | "PRODUCT" | "SERVICE"
  >("ALL");

  const [visibleProductLimit, setVisibleProductLimit] = useState(10);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paidAmount, setPaidAmount] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );
  const [tabletCartOpen, setTabletCartOpen] = useState(false);
  const serviceDataRef = useRef({
    complaint: "",
    diagnosis_note: "",
    motorcycle_type: "",
  });

  const [pendingSale, setPendingSale] = useState<Sale | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    "PENDING" | "PAID" | "EXPIRED"
  >("PENDING");
  const [timeLeft, setTimeLeft] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [qrError, setQrError] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);
  const retrySaleIdRef = useRef<number | null>(null);

  useEffect(() => {
    setVisibleProductLimit(10);
  }, [search, categoryFilter]);

  const remainingStockMap = useMemo(() => {
    const map = new Map<number, number>();
    products.forEach((p) => {
      map.set(p.id, p.current_stock);
    });
    cart.forEach((item) => {
      if (item.item_type === "PRODUCT" && item.product) {
        const current = map.get(item.product.id) ?? item.product.current_stock;
        map.set(item.product.id, current - item.quantity);
      }
    });
    return map;
  }, [products, cart]);

  const hasServiceItems = useMemo(
    () => cart.some((l) => l.item_type === "SERVICE"),
    [cart],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pd, sv, cu] = await Promise.all([
        getProductsApi({ per_page: 200, all: 1 }),
        getServicesApi({ per_page: 200, all: 1 }),
        getCustomersApi({ per_page: 200 }),
      ]);
      setProducts(pd.data);
      setServices(sv.data);
      setCustomers(cu.data);
    } catch (e) {
      const err = e as { message?: string };
      setLoadError(err.message || "Gagal memuat katalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Load sale untuk dilanjutkan pembayaran - DEKLARASI SEBELUM useEffect
  const loadSaleForResume = useCallback(
    async (saleId: number) => {
      try {
        const sale = await getSaleApi(saleId);
        if (sale.status === "PENDING" && sale.payment_method) {
          setPendingSale(sale);
          setPaymentStatus("PENDING");
          setCheckoutOpen(true);
          setPaymentMethod(sale.payment_method as PaymentMethod);
        }
      } catch (e) {
        const err = e as { message?: string };
        toast.error(err.message || "Gagal memuat transaksi untuk dilanjutkan");
      }
    },
    [toast, setCheckoutOpen],
  );

  // Handle resume payment dari search params
  useEffect(() => {
    const resumePaymentId = searchParams.get("resume_payment");
    if (resumePaymentId) {
      const id = Number(resumePaymentId);
      if (!isNaN(id)) {
        loadSaleForResume(id);
      }
    }
  }, [searchParams, loadSaleForResume]);

  const filteredProducts = useMemo(() => {
    if (categoryFilter === "SERVICE") return [];
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [products, search, categoryFilter]);

  const filteredServices = useMemo(() => {
    if (categoryFilter === "PRODUCT") return [];
    const q = search.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, search, categoryFilter]);

  const activeProducts = useMemo(() => {
    return filteredProducts.filter((p) => p.is_active);
  }, [filteredProducts]);

  const displayedProducts = useMemo(() => {
    if (categoryFilter === "ALL") {
      return activeProducts.slice(0, visibleProductLimit);
    }
    return activeProducts.slice(0, 60);
  }, [activeProducts, categoryFilter, visibleProductLimit]);

  const isOnlinePayment = ["QRIS", "VA"].includes(paymentMethod);

  useEffect(() => {
    if (!pendingSale?.payment_expires_at || paymentStatus !== "PENDING") return;

    const expires = new Date(pendingSale.payment_expires_at).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setPaymentStatus("EXPIRED");
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pendingSale?.payment_expires_at, paymentStatus]);

  useEffect(() => {
    if (!pendingSale || paymentStatus !== "PENDING") return;

    const poll = async () => {
      try {
        const res = await getSaleApi(pendingSale.id);
        if (res.status === "PAID") {
          setPaymentStatus("PAID");
          setPendingSale(res);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setShowSuccessModal(true);
        } else if (res.status === "EXPIRED") {
          setPaymentStatus("EXPIRED");
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch {
        // Silent fail
      }
    };

    pollingIntervalRef.current = setInterval(poll, 5000) as unknown as number;
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [pendingSale, paymentStatus]);

  const copyVa = useCallback(async () => {
    if (!pendingSale?.gateway_va_number) return;
    try {
      await navigator.clipboard.writeText(pendingSale.gateway_va_number);
      setCopyFeedback(true);
      toast.success("Nomor VA disalin");
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      toast.error("Gagal menyalin");
    }
  }, [pendingSale, toast]);

  const handleSimulatePayment = useCallback(async () => {
    if (!pendingSale || simulating) return;
    setSimulating(true);
    try {
      await simulatePaymentApi(pendingSale.sale_code);
      const res = await getSaleApi(pendingSale.id);
      if (res.status === "PAID") {
        setPaymentStatus("PAID");
        setPendingSale(res);
        setShowSuccessModal(true);
      }
    } catch {
      toast.error("Gagal mensimulasikan pembayaran");
    } finally {
      setSimulating(false);
    }
  }, [pendingSale, simulating, toast]);

  const handleRetryPayment = useCallback(() => {
    setPendingSale(null);
    setPaymentStatus("PENDING");
    setTimeLeft(0);
    setQrError(false);
    setCopyFeedback(false);
  }, []);

  const handleClosePaymentModal = useCallback(() => {
    retrySaleIdRef.current = null;
    setCheckoutOpen(false);
    setPendingSale(null);
    setPaymentStatus("PENDING");
    setTimeLeft(0);
    setQrError(false);
    setCopyFeedback(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, [setCheckoutOpen]);

  const handlePrintReceipt = useCallback(() => {
    if (!pendingSale) return;
    setShowSuccessModal(false);
    handleClosePaymentModal();
    navigate(`/pos/struk/${pendingSale.id}?autoprint=true`);
  }, [pendingSale, navigate, handleClosePaymentModal]);

  const handleCloseSuccessModal = useCallback(() => {
    setShowSuccessModal(false);
    handleClosePaymentModal();
    setCart([]);
    setPaidAmount(0);
    setSelectedCustomerId(null);
    refreshNotifications();
  }, [handleClosePaymentModal, setCart, refreshNotifications]);

  const handleConfirmCancel = useCallback(async () => {
    if (!pendingSale) return;
    try {
      await voidSaleApi(pendingSale.id, "Dibatalkan oleh kasir");
      toast.success("Transaksi berhasil dibatalkan");
      setShowCancelConfirm(false);
      handleClosePaymentModal();
      setCart([]);
      setPaidAmount(0);
      setSelectedCustomerId(null);
      refreshNotifications();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message || "Gagal membatalkan transaksi");
    }
  }, [
    pendingSale,
    toast,
    handleClosePaymentModal,
    setCart,
    refreshNotifications,
  ]);

  // Modal untuk input reason pembatalan
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);

  const handleRequestCancel = useCallback(() => {
    setCancelReason("");
    setShowCancelReasonModal(true);
  }, []);

  const handleConfirmCancelWithReason = useCallback(async () => {
    if (!pendingSale) return;
    if (!cancelReason.trim()) {
      toast.error("Alasan pembatalan wajib diisi.");
      return;
    }
    try {
      await voidSaleApi(pendingSale.id, cancelReason.trim());
      toast.success("Transaksi berhasil dibatalkan");
      setShowCancelReasonModal(false);
      setShowCancelConfirm(false);
      handleClosePaymentModal();
      setCart([]);
      setPaidAmount(0);
      setSelectedCustomerId(null);
      refreshNotifications();
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err.message || "Gagal membatalkan transaksi");
    }
  }, [
    pendingSale,
    cancelReason,
    toast,
    handleClosePaymentModal,
    setCart,
    refreshNotifications,
  ]);

  const doCheckout = async () => {
    const svc = serviceDataRef.current;
    if (hasServiceItems && !svc.complaint.trim()) {
      toast.error("Keluhan pelanggan wajib diisi untuk transaksi servis.");
      return;
    }
    setCheckoutLoading(true);
    try {
      const salePayload: CreateSalePayload = {
        customer_id: selectedCustomerId ?? undefined,
        discount_amount: discount,
        items: cart.map((l) =>
          l.item_type === "PRODUCT"
            ? {
                item_type: "PRODUCT",
                product_id: l.product!.id,
                quantity: l.quantity,
              }
            : {
                item_type: "SERVICE",
                service_id: l.service!.id,
                quantity: l.quantity,
              },
        ),
      };
      let sale: Sale;
      if (retrySaleIdRef.current) {
        const resumed = await getSaleApi(retrySaleIdRef.current);
        if (resumed.status === "DRAFT") {
          sale = resumed;
        } else {
          retrySaleIdRef.current = null;
          sale = await createSaleApi(salePayload);
          retrySaleIdRef.current = sale.id;
        }
      } else {
        sale = await createSaleApi(salePayload);
        retrySaleIdRef.current = sale.id;
      }
      const paid = await checkoutSaleApi(sale.id, {
        payment_method: paymentMethod,
        paid_amount: isOnlinePayment ? undefined : paidAmount,
        discount_amount: discount,
        is_service: hasServiceItems || undefined,
        complaint: hasServiceItems ? svc.complaint : undefined,
        diagnosis_note:
          hasServiceItems && svc.diagnosis_note
            ? svc.diagnosis_note
            : undefined,
        motorcycle_type:
          hasServiceItems && svc.motorcycle_type
            ? svc.motorcycle_type
            : undefined,
      });

      if (paymentMethod === "CASH") {
        retrySaleIdRef.current = null;
        setCheckoutOpen(false);
        refreshNotifications();
        setCart([]);
        setPaidAmount(0);
        setSelectedCustomerId(null);
        navigate(`/pos/struk/${paid.id}`);
      } else {
        retrySaleIdRef.current = null;
        setPendingSale(paid);
        setPaymentStatus("PENDING");
        refreshNotifications();
      }
    } catch (e) {
      const err = e as {
        message?: string;
        code?: string;
        errors?: Record<string, string[]>;
      };
      if (err.code === "PAYMENT_GATEWAY_UNAVAILABLE") {
        setPaymentMethod("CASH");
        toast.error(
          err.message ||
            "Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.",
        );
        return;
      }
      retrySaleIdRef.current = null;
      if (err.errors) {
        const msg = Object.values(err.errors).flat().join(" ");
        toast.error(msg || err.message || "Checkout gagal.");
      } else {
        toast.error(err.message || "Checkout gagal.");
      }
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="flex gap-6 min-h-screen bg-[#f4f6fb] font-sans text-slate-800 -m-4 p-4 pb-24 md:-m-6 md:p-6 md:pb-6 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama produk atau jasa..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs font-medium text-slate-800 shadow-2xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="bg-white p-1 rounded-xl border border-slate-200 flex gap-1 shadow-2xs shrink-0">
            <button
              onClick={() => setCategoryFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                categoryFilter === "ALL"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setCategoryFilter("PRODUCT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                categoryFilter === "PRODUCT"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Sparepart
            </button>
            <button
              onClick={() => setCategoryFilter("SERVICE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                categoryFilter === "SERVICE"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Jasa
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
            Memuat katalog produk & jasa...
          </div>
        ) : loadError ? (
          <div className="bg-red-50 text-red-600 p-6 rounded-2xl border border-red-200 text-xs flex justify-between items-center">
            <span>{loadError}</span>
            <button onClick={load} className="underline font-bold">
              Coba Lagi
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {(categoryFilter === "ALL" || categoryFilter === "PRODUCT") && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-3.5 bg-blue-600 rounded-full"></div>
                  <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    PRODUK / SPAREPART
                  </h2>
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="bg-white p-6 rounded-2xl text-center text-xs text-slate-400">
                    Sparepart tidak ditemukan.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3">
                      {displayedProducts.map((p) => {
                        const inCart = cart.some(
                          (c) =>
                            c.item_type === "PRODUCT" && c.product?.id === p.id,
                        );
                        const currentStock =
                          remainingStockMap.get(p.id) ?? p.current_stock;

                        return (
                          <button
                            key={p.id}
                            onClick={() => addProduct(p)}
                            disabled={currentStock <= 0}
                            className={`bg-white rounded-2xl p-3.5 border transition-all text-left flex items-center gap-3 relative group hover:shadow-md min-h-[104px] ${
                              inCart
                                ? "border-blue-600 ring-1 ring-blue-600 bg-blue-50/20"
                                : "border-slate-200/80 hover:border-blue-400"
                            } ${currentStock <= 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden border border-slate-100">
                              {p.image ? (
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                    const parent = (e.target as HTMLElement)
                                      .parentElement;
                                    if (parent) {
                                      parent.innerHTML =
                                        '<span class="text-xl">⚙️</span>';
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-xl">⚙️</span>
                              )}
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch py-0.5">
                              <div>
                                <h3 className="font-bold text-xs text-slate-800 line-clamp-2 group-hover:text-blue-600 transition-colors leading-tight">
                                  {p.name}
                                </h3>
                              </div>

                              <div className="mt-1 space-y-1">
                                <p className="text-xs font-black text-blue-600 leading-none">
                                  {formatRupiah(p.sale_price)}
                                </p>
                                <div>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-block leading-none ${
                                      currentStock <= 0
                                        ? "bg-red-100 text-red-600"
                                        : currentStock <= 5
                                          ? "bg-amber-100 text-amber-700"
                                          : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    {currentStock <= 0
                                      ? "Stok Habis"
                                      : `Stok: ${currentStock}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {categoryFilter === "ALL" &&
                      activeProducts.length > visibleProductLimit && (
                        <div className="mt-4 text-center">
                          <button
                            onClick={() =>
                              setVisibleProductLimit((prev) => prev + 20)
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-blue-600 font-bold text-xs rounded-xl shadow-2xs transition-all active:scale-95"
                          >
                            <span>Tampilkan Lebih Banyak</span>
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                  </>
                )}
              </div>
            )}

            {(categoryFilter === "ALL" || categoryFilter === "SERVICE") && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-3.5 bg-blue-600 rounded-full"></div>
                  <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    JASA SERVIS
                  </h2>
                </div>

                {filteredServices.length === 0 ? (
                  <div className="bg-white p-6 rounded-2xl text-center text-xs text-slate-400">
                    Jasa servis tidak ditemukan.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 gap-3">
                    {filteredServices
                      .filter((s) => s.is_active)
                      .map((s) => {
                        const inCart = cart.some(
                          (c) =>
                            c.item_type === "SERVICE" && c.service?.id === s.id,
                        );
                        return (
                          <button
                            key={s.id}
                            onClick={() => addService(s)}
                            className={`bg-white rounded-2xl p-3.5 border transition-all text-left flex items-center gap-3 relative group hover:shadow-md min-h-[90px] ${
                              inCart
                                ? "border-blue-600 ring-1 ring-blue-600 bg-blue-50/20"
                                : "border-slate-200/80 hover:border-blue-400"
                            }`}
                          >
                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-100">
                              <span className="text-xl">🛠️</span>
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch py-0.5">
                              <h3 className="font-bold text-xs text-slate-800 line-clamp-2 group-hover:text-blue-600 transition-colors leading-tight">
                                {s.name}
                              </h3>
                              <p className="text-xs font-black text-blue-600 leading-none mt-1">
                                {formatRupiah(s.sale_price)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hidden xl:block w-80 shrink-0 sticky top-0 h-[calc(100vh-3rem)]">
        <RightCartSidebar />
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white p-3 xl:hidden">
          <button
            onClick={() => setTabletCartOpen(true)}
            className="flex w-full items-center justify-between rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-lg shadow-blue-500/20 active:scale-[0.99] transition-transform"
          >
            <span className="text-xs font-bold">
              Keranjang ({cart.length} Item) - Lihat Pesanan
            </span>
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <span>{formatRupiah(grandTotal)}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>
        </div>
      )}

      <RightCartSidebar
        isOpenMobile={tabletCartOpen}
        onCloseMobile={() => setTabletCartOpen(false)}
      />

      {/* ---------------- MODAL KONFIRMASI PEMBAYARAN ---------------- */}
      <Modal
        open={checkoutOpen}
        onClose={handleClosePaymentModal}
        title="Payment Details"
        size="md"
        contentClassName="max-h-[70vh] overflow-y-auto px-6 py-4"
        footer={
          paymentStatus === "EXPIRED" ? (
            <div className="flex items-center justify-between w-full py-1 gap-2">
              <button
                onClick={handleClosePaymentModal}
                className="flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                <span className="text-slate-400">✕</span> Tutup
              </button>
              <button
                onClick={handleRetryPayment}
                className="flex items-center gap-2 bg-[#1d4ed8] hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-md transition-all"
              >
                <ArrowRight className="h-4 w-4" />
                Coba Lagi
              </button>
            </div>
          ) : pendingSale && paymentStatus === "PENDING" ? (
            <div className="flex items-center justify-between w-full py-1">
              <button
                onClick={handleRequestCancel}
                className="flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                <span className="text-slate-400">✕</span> Batal
              </button>

              <button
                onClick={handleClosePaymentModal}
                className="flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                Tutup (Pembayaran Tetap Berjalan)
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full py-1">
              <button
                onClick={handleClosePaymentModal}
                disabled={checkoutLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                <span className="text-slate-400">✕</span> Batal
              </button>
              <button
                onClick={doCheckout}
                disabled={
                  checkoutLoading ||
                  (!isOnlinePayment &&
                    (paidAmount <= 0 || paidAmount < grandTotal))
                }
                className={`flex items-center gap-2 bg-[#1d4ed8] hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-md transition-all ${
                  !isOnlinePayment &&
                  (paidAmount <= 0 || paidAmount < grandTotal)
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {isOnlinePayment ? (
                  <>
                    <Printer className="h-4 w-4" />
                    Proses Pembayaran
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Konfirmasi Pembayaran
                  </>
                )}
              </button>
            </div>
          )
        }
      >
        <div className="space-y-3.5">
          {pendingSale && paymentStatus === "EXPIRED" && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/20 bg-destructive/5">
              <div className="flex-shrink-0 p-2 rounded-lg bg-destructive/15">
                <XCircle
                  className="h-6 w-6 text-destructive"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-destructive">
                  Pembayaran Kedaluwarsa
                </h2>
                <p className="text-sm text-gray-500">
                  Waktu pembayaran (5 menit) telah habis. Silakan coba lagi.
                </p>
              </div>
            </div>
          )}

          <div className="-mt-1">
            <p className="text-xs text-slate-500 font-medium">
              Konfirmasi & metode pembayaran
            </p>
          </div>

          {/* 1. Ringkasan Pesanan */}
          <div className="rounded-2xl bg-white border border-slate-200/80 p-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 border border-blue-100">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    Ringkasan Pesanan
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {cart.reduce((acc, item) => acc + item.quantity, 0)} item
                    produk
                  </p>
                  {pendingSale && (
                    <p className="text-[10px] text-slate-400 font-mono">
                      {pendingSale.sale_code}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-blue-600">
                  {formatRupiah(grandTotal)}
                </p>
                <button
                  type="button"
                  onClick={() => setShowOrderDetail(!showOrderDetail)}
                  className="text-[11px] text-slate-500 hover:text-blue-600 font-medium transition-colors flex items-center gap-1 ml-auto"
                >
                  Lihat Detail
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${showOrderDetail ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            </div>

            {showOrderDetail && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {cart.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          {item.item_type === "PRODUCT"
                            ? item.product?.name
                            : item.service?.name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {formatNumber(item.quantity)} ×{" "}
                          {formatRupiah(
                            item.item_type === "PRODUCT"
                              ? item.product?.sale_price || 0
                              : item.service?.sale_price || 0,
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">
                          {formatRupiah(
                            item.quantity *
                              (item.item_type === "PRODUCT"
                                ? item.product?.sale_price || 0
                                : item.service?.sale_price || 0),
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Subtotal:</span>
                    <span className="font-semibold text-slate-800">
                      {formatRupiah(
                        cart.reduce(
                          (acc, item) =>
                            acc +
                            item.quantity *
                              (item.item_type === "PRODUCT"
                                ? item.product?.sale_price || 0
                                : item.service?.sale_price || 0),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                  {discount > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Diskon:</span>
                      <span className="font-semibold text-red-600">
                        - {formatRupiah(discount)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-200">
                    <span className="font-bold text-slate-800">Total:</span>
                    <span className="font-black text-blue-600">
                      {formatRupiah(grandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Countdown Timer untuk QRIS/VA PENDING */}
          {pendingSale && paymentStatus === "PENDING" && (
            <div
              className="space-y-3 p-4 rounded-xl border border-gray-100 bg-gray-50"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex items-center justify-center gap-2">
                <Clock
                  className="h-5 w-5"
                  style={{
                    color:
                      timeLeft <= 180
                        ? "var(--color-warning)"
                        : "var(--color-primary)",
                  }}
                  aria-hidden="true"
                />
                <span
                  className="text-xl md:text-2xl font-mono font-bold tabular-nums"
                  style={{
                    color:
                      timeLeft <= 180
                        ? "var(--color-warning)"
                        : "var(--color-primary)",
                  }}
                >
                  {String(Math.floor(timeLeft / 60)).padStart(2, "0")}:
                  {String(timeLeft % 60).padStart(2, "0")}
                </span>
              </div>
              <div
                className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round((timeLeft / 300) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Waktu tersisa pembayaran"
              >
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${(timeLeft / 300) * 100}%`,
                    backgroundColor:
                      timeLeft <= 180
                        ? "var(--color-warning)"
                        : "var(--color-primary)",
                  }}
                />
              </div>
              <p className="text-xs text-center text-gray-500">
                Sisa waktu sebelum kedaluwarsa (
                {timeLeft <= 180 ? "kurang dari 3 menit" : "masih cukup waktu"})
              </p>
            </div>
          )}

          {/* 2. Pilih Metode Pembayaran */}
          {!pendingSale && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800">
                Pilih Metode Pembayaran
              </label>
              <PaymentMethodSelector
                value={paymentMethod}
                onChange={(m) =>
                  setPaymentMethod(m as keyof typeof PAYMENT_METHODS)
                }
              />
            </div>
          )}

          {/* 3. Pelanggan */}
          {!pendingSale && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Pelanggan
              </label>
              <CustomerSelector
                customers={customers}
                selectedId={selectedCustomerId}
                onSelect={setSelectedCustomerId}
                onCustomerCreated={(c) => {
                  setCustomers((prev) => [...prev, c]);
                  setSelectedCustomerId(c.id);
                }}
                isRequired={hasServiceItems}
                onServiceDataChange={(data) => {
                  serviceDataRef.current = data;
                }}
              />
            </div>
          )}

          {/* 4. Bagian Tampilan Pembayaran (Dinamis Sesuai Referensi Visual) */}
          <div className="space-y-2">
            {!pendingSale && (
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {paymentMethod === "QRIS"
                    ? "Pembayaran QRIS"
                    : paymentMethod === "VA"
                      ? "Pembayaran Virtual Account"
                      : "Pembayaran Tunai"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {paymentMethod === "QRIS"
                    ? "Scan kode QR berikut menggunakan aplikasi e-wallet / m-banking Anda"
                    : paymentMethod === "VA"
                      ? "Transfer ke nomor Virtual Account yang akan ditampilkan"
                      : "Masukkan jumlah uang yang diberikan pelanggan"}
                </p>
              </div>
            )}

            {/* TAMPILAN VA - Sebelum Checkout (Preview Persis Referensi) */}
            {!pendingSale && paymentMethod === "VA" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 flex flex-col justify-between space-y-3 shadow-2xs">
                  <div className="space-y-1 text-center sm:text-left">
                    <p className="text-[10px] font-black text-slate-800 uppercase tracking-wide">
                      BENGKEL PUTRA MOTOR
                    </p>
                    <p className="text-[9px] text-slate-500">
                      Nomor Virtual Account
                    </p>
                  </div>

                  <div className="flex items-center justify-between bg-blue-50/40 border border-blue-100 rounded-xl p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-blue-700 tracking-wider">
                        BRI
                      </span>
                      <span className="text-[10px] text-slate-600 font-semibold">
                        BRI Virtual Account
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-gray-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-sm font-mono font-black text-slate-400 tracking-wider">
                      Akan muncul setelah proses
                    </span>
                    <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                      Salin
                    </span>
                  </div>

                  <div className="space-y-0.5 pt-1 border-t border-slate-100">
                    <p className="text-[9px] text-slate-400 font-medium">
                      Nama Pelanggan
                    </p>
                    <p className="text-xs font-bold text-slate-800">
                      {customers.find((c) => c.id === selectedCustomerId)
                        ?.name || "Kasir Bengkel"}
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[9px] text-slate-400 font-medium">
                      Total Pembayaran
                    </p>
                    <p className="text-sm font-black text-blue-600">
                      {formatRupiah(grandTotal)}
                    </p>
                  </div>

                  <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 pt-0.5">
                    <span>🕒</span> Nomor VA berlaku selama{" "}
                    <span className="text-blue-600 font-bold">05:00 menit</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-800">
                      Cara Pembayaran
                    </p>
                    <ol className="text-[11px] text-slate-600 space-y-1.5 pl-4 list-decimal leading-snug">
                      <li>Pilih menu Transfer di aplikasi mobile banking</li>
                      <li>Pilih Bank BRI</li>
                      <li>Pilih jenis transfer ke Virtual Account</li>
                      <li>Masukkan nomor Virtual Account di samping</li>
                      <li>Periksa detail pembayaran, pastikan sesuai</li>
                      <li>Selesaikan pembayaran sebelum waktu habis</li>
                    </ol>
                  </div>

                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5 flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-900 leading-tight">
                      Pembayaran akan otomatis terverifikasi setelah transaksi
                      berhasil.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* SEBELUM CHECKOUT: QRIS PREVIEW */}
            {!pendingSale && paymentMethod === "QRIS" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3 flex flex-col items-center justify-between text-center space-y-2">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide">
                      BENGKEL PUTRA MOTOR
                    </p>
                    <p className="text-[9px] text-slate-500 font-medium">
                      QR Code akan muncul setelah checkout
                    </p>
                  </div>

                  <div className="bg-gray-50 border border-slate-100 rounded-xl p-2 w-36 h-36 flex items-center justify-center shadow-2xs">
                    <div className="text-center space-y-2">
                      <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
                      <p className="text-xs text-gray-500">Preview</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between w-full px-2 pt-1 border-t border-slate-100">
                    <span className="text-[10px] font-extrabold tracking-tighter text-blue-900">
                      QRIS
                    </span>
                    <span className="text-[9px] text-slate-500 font-medium">
                      QR Code Standar Pembayaran Nasional
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 pt-0.5">
                    <span>🕒</span> Kode QR berlaku selama{" "}
                    <span className="text-blue-600 font-bold">05:00 menit</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 flex flex-col justify-between space-y-2">
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-800">
                      Cara Pembayaran
                    </p>
                    <ol className="text-[11px] text-slate-600 space-y-1 pl-4 list-decimal leading-snug">
                      <li>Buka aplikasi e-wallet / m-banking Anda</li>
                      <li>
                        Pilih menu{" "}
                        <span className="font-bold text-slate-800">
                          Scan QR / QRIS
                        </span>
                      </li>
                      <li>Scan kode QR di samping</li>
                      <li>Pastikan nominal sesuai, lalu konfirmasi</li>
                    </ol>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
                    <p className="text-[10px] text-slate-500 font-medium text-center">
                      Menerima pembayaran dari semua e-wallet
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-700 bg-white border border-slate-200/60 rounded-xl p-2">
                      <span className="text-blue-600">gopay</span>
                      <span className="text-purple-600">OVO</span>
                      <span className="text-cyan-600">DANA</span>
                      <span className="text-red-500">LinkAja!</span>
                      <span className="text-orange-500">ShopeePay</span>
                      <span className="text-blue-800">BRIMO</span>
                      <span className="text-sky-600">livin'</span>
                      <span className="text-blue-900">BCA</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SETELAH CHECKOUT: QRIS AKTIF */}
            {pendingSale &&
              pendingSale.payment_method === "QRIS" &&
              paymentStatus === "PENDING" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-3 flex flex-col items-center justify-between text-center space-y-2">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide">
                        BENGKEL PUTRA MOTOR
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium">
                        Scan QR Code untuk pembayaran
                      </p>
                    </div>

                    <div className="bg-white border border-slate-100 rounded-xl p-2 w-36 h-36 flex items-center justify-center shadow-2xs">
                      {!qrError && pendingSale.gateway_qr_string ? (
                        <QRCode
                          value={pendingSale.gateway_qr_string}
                          size={200}
                          className="w-full h-full"
                          bgColor="#FFFFFF"
                          fgColor="#111827"
                          level="M"
                        />
                      ) : (
                        <div className="text-center space-y-2">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                          <p className="text-xs text-gray-500">
                            Memuat QR Code...
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Shield
                        className="h-4 w-4 text-green-500"
                        aria-hidden="true"
                      />
                      <span className="text-[10px]">
                        Transaksi aman & terenkripsi
                      </span>
                    </div>

                    {import.meta.env.DEV && (
                      <button
                        onClick={handleSimulatePayment}
                        disabled={simulating}
                        className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold transition-colors"
                      >
                        {simulating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Mensimulasikan...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Simulasi Bayar (Dev)
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 flex flex-col justify-between space-y-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-slate-800">
                        Cara Pembayaran
                      </p>
                      <ol className="text-[11px] text-slate-600 space-y-1 pl-4 list-decimal leading-snug">
                        <li>Buka aplikasi e-wallet / m-banking Anda</li>
                        <li>
                          Pilih menu{" "}
                          <span className="font-bold text-slate-800">
                            Scan QR / QRIS
                          </span>
                        </li>
                        <li>Scan kode QR di samping</li>
                        <li>Pastikan nominal sesuai, lalu konfirmasi</li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

            {/* SETELAH CHECKOUT: VA AKTIF (Real Data dengan Simulasi Dev seperti QRIS) */}
            {pendingSale &&
              pendingSale.payment_method === "VA" &&
              paymentStatus === "PENDING" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Pembayaran Virtual Account
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Transfer ke nomor Virtual Account berikut sebelum waktu
                      berakhir
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 flex flex-col justify-between space-y-3 shadow-2xs">
                      <div className="space-y-1 text-center sm:text-left">
                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-wide">
                          BENGKEL PUTRA MOTOR
                        </p>
                        <p className="text-[9px] text-slate-500">
                          Nomor Virtual Account
                        </p>
                      </div>

                      <div className="flex items-center justify-between bg-blue-50/40 border border-blue-100 rounded-xl p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-blue-700 tracking-wider">
                            BRI
                          </span>
                          <span className="text-[10px] text-slate-600 font-semibold">
                            BRI Virtual Account
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-gray-50 border border-slate-200 rounded-xl px-3 py-2">
                        <span className="text-sm font-mono font-black text-slate-900 tracking-wider">
                          {pendingSale.gateway_va_number ||
                            "8877 1020 3040 5060 7"}
                        </span>
                        <button
                          onClick={copyVa}
                          disabled={copyFeedback}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs transition-colors shrink-0"
                        >
                          {copyFeedback ? "Disalin!" : "Salin"}
                        </button>
                      </div>

                      <div className="space-y-0.5 pt-1 border-t border-slate-100">
                        <p className="text-[9px] text-slate-400 font-medium">
                          Nama Pelanggan
                        </p>
                        <p className="text-xs font-bold text-slate-800">
                          {customers.find((c) => c.id === selectedCustomerId)
                            ?.name || "Kasir Bengkel"}
                        </p>
                      </div>

                      <div className="space-y-0.5">
                        <p className="text-[9px] text-slate-400 font-medium">
                          Total Pembayaran
                        </p>
                        <p className="text-sm font-black text-blue-600">
                          {formatRupiah(grandTotal)}
                        </p>
                      </div>

                      {import.meta.env.DEV && (
                        <button
                          onClick={handleSimulatePayment}
                          disabled={simulating}
                          className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold transition-colors"
                        >
                          {simulating ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Mensimulasikan...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Simulasi Bayar (Dev)
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-800">
                          Cara Pembayaran
                        </p>
                        <ol className="text-[11px] text-slate-600 space-y-1.5 pl-4 list-decimal leading-snug">
                          <li>
                            Pilih menu Transfer di aplikasi mobile banking
                          </li>
                          <li>Pilih Bank BRI</li>
                          <li>Pilih jenis transfer ke Virtual Account</li>
                          <li>Masukkan nomor Virtual Account di samping</li>
                          <li>Periksa detail pembayaran, pastikan sesuai</li>
                          <li>Selesaikan pembayaran sebelum waktu habis</li>
                        </ol>
                      </div>

                      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5 flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-blue-900 leading-tight">
                          Pembayaran akan otomatis terverifikasi setelah
                          transaksi berhasil.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* TAMPILAN TUNAI */}
            {!pendingSale && paymentMethod === "CASH" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-3 space-y-2.5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                        TOTAL YANG HARUS DIBAYAR
                      </label>
                      <div className="text-sm font-black text-blue-600">
                        {formatRupiah(grandTotal)}
                      </div>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                        UANG DIBAYARKAN
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={paidAmount || ""}
                        onChange={(e) => setPaidAmount(Number(e.target.value))}
                        placeholder="Rp 0"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                        UANG KEMBALIAN
                      </label>
                      <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 p-2">
                        <span className="text-xs font-black text-emerald-600">
                          {formatRupiah(Math.max(0, paidAmount - grandTotal))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 flex flex-col justify-between space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs">
                      <span className="w-3.5 h-3.5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[9px]">
                        ℹ
                      </span>
                      Informasi
                    </div>
                    <ul className="text-[11px] text-slate-500 space-y-0.5 pl-4 list-disc">
                      <li>Pastikan jumlah uang yang diterima sesuai.</li>
                      <li>Uang kembalian dihitung otomatis.</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50/30 rounded-xl border border-blue-100/50 p-1.5 flex items-center justify-center overflow-hidden">
                    <img
                      src={ilustrasi}
                      alt="Ilustrasi Transaksi Kasir"
                      className="w-full h-28 md:h-32 object-cover object-center rounded-lg scale-110"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ---------------- MODAL KONFIRMASI PEMBATALAN ---------------- */}
      <ConfirmDialog
        open={showCancelConfirm}
        title={`Batalkan Transaksi ${pendingSale?.sale_code ?? ""}?`}
        message="Transaksi yang dibatalkan akan mengembalikan stok sparepart. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Batalkan Transaksi"
        danger
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* ---------------- MODAL INPUT ALASAN PEMBATALAN ---------------- */}
      <Modal
        open={showCancelReasonModal}
        onClose={() => setShowCancelReasonModal(false)}
        title="Konfirmasi Pembatalan"
        size="md"
      >
        <div className="space-y-4 py-4">
          <div>
            <p className="text-xs text-slate-600 mb-2">
              Anda akan membatalkan transaksi{" "}
              <span className="font-bold text-slate-900">
                {pendingSale?.sale_code}
              </span>
              . Alasan pembatalan akan dicatat dalam laporan audit.
            </p>
            <label className="text-xs font-bold text-slate-800 block mb-1">
              Alasan Pembatalan <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Contoh: Pelanggan membatalkan pembelian"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Catatan ini akan tersimpan dalam laporan admin untuk audit trail.
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <button
              onClick={handleConfirmCancelWithReason}
              disabled={!cancelReason.trim()}
              className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                !cancelReason.trim()
                  ? "opacity-50 cursor-not-allowed bg-slate-100 text-slate-500"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              <XCircle className="h-4 w-4" />
              Batalkan Transaksi
            </button>
            <button
              onClick={() => setShowCancelReasonModal(false)}
              className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 font-semibold text-sm px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      </Modal>

      {/* ---------------- MODAL SUKSES PEMBAYARAN ---------------- */}
      <Modal
        open={showSuccessModal}
        onClose={handleCloseSuccessModal}
        title="Pembayaran Berhasil"
        size="sm"
      >
        <div className="text-center space-y-4 py-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2
              className="h-10 w-10 text-success"
              aria-hidden="true"
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Pembayaran Berhasil!
            </h3>
            <p className="text-sm text-gray-500 mt-2">
              Transaksi telah dibayar dan dicatat secara otomatis.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={handlePrintReceipt}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-5 py-3 rounded-xl shadow-md transition-all"
            >
              <Printer className="h-5 w-5" />
              Cetak Struk
            </button>
            <button
              onClick={handleCloseSuccessModal}
              className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 font-semibold text-sm px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
