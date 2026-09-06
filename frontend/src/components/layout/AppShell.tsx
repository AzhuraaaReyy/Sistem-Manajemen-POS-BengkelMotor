import { useRef, useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { MenuIcon, CloseIcon } from "@/components/shared/icons";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { PosProvider } from "@/features/pos/PosContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Search as SearchIcon } from "lucide-react";
import { searchGlobalApi, type SearchResult } from "@/lib/api/search";
import { formatRupiah } from "@/lib/formatters";

const PAGE_META: Array<{ path: string; title: string; description: string }> = [
  {
    path: "/dashboard",
    title: "Dashboard",
    description: "Ringkasan kondisi bengkel hari ini",
  },
  {
    path: "/pos",
    title: "POS",
    description: "Transaksi penjualan sparepart & jasa servis",
  },
  {
    path: "/riwayat",
    title: "Riwayat Transaksi",
    description: "Semua transaksi POS yang tercatat",
  },
  {
    path: "/produk",
    title: "Produk & Stok",
    description: "Manajemen sparepart, harga beli, harga jual, dan stok",
  },
  {
    path: "/jasa",
    title: "Jasa Servis",
    description: "Katalog harga jasa servis",
  },
  {
    path: "/pengeluaran",
    title: "Pengeluaran",
    description: "Pencatatan pengeluaran operasional bengkel",
  },
  {
    path: "/laporan",
    title: "Laporan",
    description: "Analisis dan evaluasi perkembangan bengkel",
  },
  {
    path: "/pengguna",
    title: "Pengguna",
    description: "Manajemen akun Admin & Kasir",
  },
  {
    path: "/audit",
    title: "Audit Log",
    description: "Riwayat aktivitas penting sistem",
  },
  {
    path: "/whatsapp-chats",
    title: "Chat WhatsApp",
    description: "Kelola percakapan & booking pelanggan",
  },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length < 2) {
      setSearchResults(null);
      setSearchOpen(false);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        console.log("Searching for:", searchQuery);
        const results = await searchGlobalApi(searchQuery);
        console.log("Search results:", results);
        setSearchResults(results);
        setSearchOpen(true);
      } catch (error: any) {
        console.error("Search error:", error);
        setSearchError(error?.message || "Terjadi kesalahan saat mencari");
        setSearchResults(null);
        setSearchOpen(true);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSearchResultClick = (type: string, id: number) => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults(null);

    // Navigate based on type
    switch (type) {
      case "product":
        navigate("/produk");
        break;
      case "service":
        navigate("/jasa");
        break;
      case "customer":
        navigate(`/pelanggan/${id}`);
        break;
      case "sale":
        navigate(`/riwayat`);
        break;
    }
  };

  const pageMeta = PAGE_META.find(
    (m) =>
      location.pathname === m.path ||
      location.pathname.startsWith(`${m.path}/`),
  );

  const navLockedRef = useRef(false);
  const [navLocked, setNavLocked] = useState(false);

  const handleNavClick = (to: string) => {
    if (navLockedRef.current) return;
    navLockedRef.current = true;
    setNavLocked(true);
    setMobileOpen(false);
    navigate(to);
    window.setTimeout(() => {
      navLockedRef.current = false;
      setNavLocked(false);
    }, 200);
  };

  return (
    <PosProvider>
      <div className="h-screen w-screen overflow-hidden bg-slate-100/70 flex">
        {/* Sidebar Desktop */}
        <aside className="hidden w-64 shrink-0 bg-white lg:block h-full">
          <Sidebar onNavClick={handleNavClick} navLocked={navLocked} />
        </aside>

        {/* Drawer Mobile */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute left-0 top-0 h-full w-64 bg-white shadow-2xl">
              <div className="flex justify-end p-2">
                <button
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Tutup menu"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>
              <Sidebar onNavClick={handleNavClick} navLocked={navLocked} />
            </aside>
          </div>
        )}

        {/* Konten Utama & Topbar */}
        <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
          {/* Header Atas */}
          <header className="flex h-16 shrink-0 items-center justify-between bg-white px-4 md:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden shrink-0"
                onClick={() => setMobileOpen(true)}
                aria-label="Buka menu"
              >
                <MenuIcon className="h-6 w-6" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-900 tracking-tight">
                  {pageMeta?.title ?? "Bengkel"}
                </h1>
                {pageMeta?.description && (
                  <p className="truncate text-xs font-medium text-slate-400 hidden sm:block">
                    {pageMeta.description}
                  </p>
                )}
              </div>
            </div>

            {/* Search & Notification */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Search Input */}
              <div ref={searchRef} className="relative hidden md:block">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => searchResults && setSearchOpen(true)}
                  placeholder="Cari..."
                  className="w-64 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors"
                />
                
                {/* Search Results Dropdown */}
                {searchOpen && searchResults && searchResults.total > 0 && (
                  <div className="absolute top-full mt-2 w-96 bg-white rounded-xl border border-slate-200 shadow-xl max-h-96 overflow-y-auto z-50">
                    {/* Products */}
                    {searchResults.products.length > 0 && (
                      <div className="p-3 border-b border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Produk</p>
                        {searchResults.products.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleSearchResultClick(item.type, item.id)}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-3"
                          >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                              ) : (
                                <span className="text-lg">📦</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                              <p className="text-xs text-slate-400">{item.sku} • Stok: {item.current_stock}</p>
                            </div>
                            <p className="text-xs font-bold text-blue-600">{formatRupiah(item.sale_price)}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Services */}
                    {searchResults.services.length > 0 && (
                      <div className="p-3 border-b border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Jasa</p>
                        {searchResults.services.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleSearchResultClick(item.type, item.id)}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-3"
                          >
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              <span className="text-lg">🛠️</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                              <p className="text-xs text-slate-400 truncate">{item.description}</p>
                            </div>
                            <p className="text-xs font-bold text-blue-600">{formatRupiah(item.sale_price)}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Customers */}
                    {searchResults.customers.length > 0 && (
                      <div className="p-3 border-b border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Pelanggan</p>
                        {searchResults.customers.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleSearchResultClick(item.type, item.id)}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-400">{item.phone}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Sales */}
                    {searchResults.sales.length > 0 && (
                      <div className="p-3">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-2">Transaksi</p>
                        {searchResults.sales.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => handleSearchResultClick(item.type, item.id)}
                            className="w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            <p className="text-sm font-semibold text-slate-800">{item.sale_code}</p>
                            <p className="text-xs text-slate-400">
                              {item.customer_name || "Guest"} • {formatRupiah(item.grand_total)}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Loading indicator */}
                {searchLoading && (
                  <div className="absolute top-full mt-2 w-96 bg-white rounded-xl border border-slate-200 shadow-xl p-4 text-center z-50">
                    <p className="text-sm text-slate-400">Mencari...</p>
                  </div>
                )}

                {/* Error message */}
                {searchOpen && searchError && !searchLoading && (
                  <div className="absolute top-full mt-2 w-96 bg-white rounded-xl border border-red-200 shadow-xl p-4 text-center z-50">
                    <p className="text-sm text-red-600">{searchError}</p>
                  </div>
                )}

                {/* No results */}
                {searchOpen && searchResults && searchResults.total === 0 && !searchLoading && !searchError && (
                  <div className="absolute top-full mt-2 w-96 bg-white rounded-xl border border-slate-200 shadow-xl p-4 text-center z-50">
                    <p className="text-sm text-slate-400">Tidak ada hasil ditemukan</p>
                  </div>
                )}
              </div>
              
              {/* Notification Bell */}
              <NotificationBell />
            </div>
          </header>

          {/* Area Halaman */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 hide-scrollbar">
            <Outlet />
          </main>
        </div>
      </div>
    </PosProvider>
  );
}
