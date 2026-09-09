import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { WrenchIcon } from "@/components/shared/icons";
import bgmotor from "../../app/assets/backgroundmotor.png";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  TrendingUp,
  Package,
  ShieldCheck,
  Headphones,
} from "lucide-react";

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      const msg = "Email dan password wajib diisi.";
      setError(msg);
      toast.error(msg);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const user = await login(email, password, remember);
      toast.success("Selamat datang, " + user.name + "!");
      navigate(user.role === "ADMIN" ? "/dashboard" : "/pos");
    } catch (err) {
      const apiError = err as {
        message?: string;
        status?: number;
        retryAfter?: number;
        errors?: Record<string, string[]>;
      };
      if (apiError.status === 429) {
        const wait = apiError.retryAfter
          ? Math.ceil(apiError.retryAfter)
          : null;
        const msg = wait
          ? `Terlalu banyak percobaan login. Mohon tunggu sekitar ${wait} detik sebelum mencoba lagi.`
          : "Terlalu banyak percobaan login. Mohon tunggu beberapa saat sebelum mencoba lagi.";
        setError(msg);
        toast.error(msg);
      } else if (apiError.errors && Object.keys(apiError.errors).length) {
        const msg = Object.values(apiError.errors).flat().join(" ");
        setError(msg);
        toast.error(msg);
      } else {
        const msg =
          apiError.message ||
          "Login gagal. Periksa kembali username dan password.";
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#f8fafc] font-sans overflow-hidden">
      {/* --- KOLOM KIRI --- */}
      <div
        className="relative hidden h-full w-[55%] flex-col bg-[#0b2447] text-white md:flex z-10 shadow-2xl"
        style={{ clipPath: "polygon(0 0, 100% 0, 85% 100%, 0 100%)" }}
      >
        {/* Background Image - Diubah agar fokus gambar bergeser ke sebelah kanan */}
        <div className="absolute inset-0 z-0 flex">
          {/* Gambar Foto (Tampil utuh di latar belakang) */}
          <img
            src={bgmotor}
            alt="Bengkel Background"
            className="absolute inset-0 h-full w-full object-cover object-right opacity-60"
          />

          {/* Gradasi Biru Khusus di Sebelah Kiri (Transparan ke Kanan) */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b2447] via-[#0b2447]/80 to-transparent w-[75%] z-10"></div>

          {/* Gradasi Tipis Keseluruhan untuk menyatukan warna */}
          <div className="absolute inset-0 bg-[#0b2447]/30 z-20"></div>
        </div>

        {/* Konten Teks Kiri */}
        <div className="relative z-10 flex h-full flex-col justify-between pl-8 pr-20 py-8 lg:pl-12 lg:pr-28 lg:py-10">
          <div>
            {/* Header / Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-400/20">
                <WrenchIcon className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <p className="text-base font-bold">Bengkel</p>
                <p className="text-[10px] font-medium text-blue-200">
                  Putra Motor
                </p>
              </div>
            </div>

            {/* Headline Teks */}
            <div className="mt-8 lg:mt-10">
              <h1 className="text-2xl font-bold leading-tight xl:text-[28px] lg:leading-snug">
                Kelola transaksi bengkel <br /> lebih mudah & efisien
              </h1>
              <p className="mt-3 text-[12px] leading-relaxed text-blue-100/90 lg:w-[90%] xl:text-[13px]">
                Catat penjualan, pantau stok, dan kelola layanan bengkel dalam
                satu sistem yang terintegrasi.
              </p>
            </div>

            {/* List Fitur */}
            <div className="mt-6 flex flex-col gap-4 xl:gap-5 xl:mt-8">
              <div className="flex items-start gap-3.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[#1a4f9c] shadow-md">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-[13px]">
                    Pantau Penjualan
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-blue-100/80">
                    Lihat laporan penjualan secara real-time dan akurat.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[#1a4f9c] shadow-md">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-[13px]">
                    Kelola Stok
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-blue-100/80">
                    Kontrol stok sparepart dan jasa dengan mudah.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-[#1a4f9c] shadow-md">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-[13px]">
                    Aman & Terpercaya
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-blue-100/80">
                    Data tersimpan aman dan hanya dapat diakses pengguna
                    terdaftar.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bantuan Support */}
          <div className="flex items-center gap-3">
            <Headphones className="h-7 w-7 text-white/90" />
            <div>
              <p className="text-[13px] font-semibold text-white">
                Butuh bantuan?
              </p>
              <p className="text-[11px] text-blue-100/80">
                Hubungi admin atau tim support.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* --- KOLOM KANAN (FORM LOGIN) --- */}
      <div className="relative flex h-full flex-1 flex-col items-center justify-center p-4 lg:p-6 overflow-hidden">
        {/* Dekorasi Pola Titik */}
        <div
          className="absolute right-4 top-4 hidden h-40 w-40 lg:block xl:right-10 xl:top-10"
          style={{
            backgroundImage: "radial-gradient(#cbd5e1 2px, transparent 2px)",
            backgroundSize: "24px 24px",
            opacity: 0.5,
          }}
        ></div>

        <div className="z-10 w-full max-w-[380px] xl:max-w-[400px]">
          {/* Header Form */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-lg shadow-blue-500/20">
              <WrenchIcon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-[22px] font-bold text-gray-900">
              Bengkel Putra Motor
            </h2>
            <p className="mt-1.5 text-[13px] text-gray-500">
              Masuk untuk melanjutkan ke sistem
            </p>
          </div>

          {/* Kotak Form */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100/80">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Input Email */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-gray-700">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-4 text-[13px] text-gray-900 transition-colors focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb] bg-gray-50/50"
                    placeholder="Masukkan email Anda"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Input Password */}
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-9 text-[13px] text-gray-900 transition-colors focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb] bg-gray-50/50"
                    placeholder="Masukkan password Anda"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me & Lupa Password */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-gray-600">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 text-[#2563eb] focus:ring-[#2563eb]"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  Ingat saya
                </label>
                <a
                  href="#"
                  className="text-[12px] font-semibold text-[#2563eb] hover:underline"
                >
                  Lupa password?
                </a>
              </div>

              {/* Pesan Error */}
              {error && (
                <div className="rounded-lg bg-red-50 p-2.5 text-[12px] text-red-600 border border-red-100">
                  {error}
                </div>
              )}

              {/* Tombol Masuk */}
              <Button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#2563eb] py-2.5 text-white hover:bg-blue-700 transition-all font-semibold text-[13px]"
                loading={loading}
              >
                {!loading && <ArrowRight className="h-4 w-4" />}
                Masuk
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
