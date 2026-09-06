import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth/AuthContext";
import { useToast } from "@/components/ui/Toast";
import {
  BoxIcon,
  CoinsIcon,
  DashboardIcon,
  HistoryIcon,
  LogoutIcon,
  MessageCircleIcon,
  PosIcon,
  ReportIcon,
  ServiceIcon,
  ShieldIcon,
  TagIcon,
  UserIcon,
  WrenchIcon,
} from "@/components/shared/icons";
import { ROLE_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

interface NavItem {
  to: string;
  label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element;
  roles: Array<"ADMIN" | "CASHIER">;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: DashboardIcon, roles: ["ADMIN"] },
  { to: "/pos", label: "POS", icon: PosIcon, roles: ["ADMIN", "CASHIER"] },
  { to: "/produk", label: "Produk & Stok", icon: BoxIcon, roles: ["ADMIN", "CASHIER"] },
  { to: "/riwayat", label: "Riwayat Transaksi", icon: HistoryIcon, roles: ["ADMIN", "CASHIER"] },
  { to: "/jasa", label: "Jasa Servis", icon: ServiceIcon, roles: ["ADMIN"] },
  { to: "/pengeluaran", label: "Pengeluaran", icon: CoinsIcon, roles: ["ADMIN"] },
  { to: "/laporan", label: "Laporan", icon: ReportIcon, roles: ["ADMIN"] },
  { to: "/pengguna", label: "Pengguna", icon: TagIcon, roles: ["ADMIN"] },
  { to: "/audit", label: "Audit Log", icon: ShieldIcon, roles: ["ADMIN"] },
  { to: "/whatsapp-chats", label: "Chat WhatsApp", icon: MessageCircleIcon, roles: ["ADMIN"] },
];

interface SidebarProps {
  onNavClick?: (to: string) => void;
  navLocked?: boolean;
}

// ==========================================
// Sub-komponen Reusable: Item Navigasi
// ==========================================
function SidebarItem({
  item,
  navLocked,
  onClick,
}: {
  item: NavItem;
  navLocked: boolean;
  onClick?: (to: string) => void;
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick(item.to);
        }
      }}
      className={({ isActive }) =>
        `flex items-center gap-3.5 rounded-2xl px-4 py-3 text-xs font-semibold transition-all duration-200 ${
          isActive
            ? "bg-white text-[#0042b4] shadow-md font-bold"
            : "text-white/90 hover:bg-white hover:text-[#0042b4]"
        } ${navLocked ? "pointer-events-none opacity-60" : ""}`
      }
    >
      <div className="h-5 w-5 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 max-w-full max-h-full object-contain" />
      </div>
      <span className="tracking-wide truncate">{item.label}</span>
    </NavLink>
  );
}

// ==========================================
// Komponen Utama: Sidebar
// ==========================================
export function Sidebar({ onNavClick, navLocked = false }: SidebarProps) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const visibleItems = user
    ? NAV_ITEMS.filter((item) => item.roles.includes(user.role))
    : [];

  const handleLogout = async () => {
    await logout();
    toast.info("Anda telah keluar.");
    navigate("/login");
  };

  return (
    /* GRADIENT DARI ATAS KE BAWAH: bg-gradient-to-b dari biru sedikit terang ke biru gelap */
    <div className="flex flex-col h-full bg-gradient-to-b from-[#0052d4] via-[#0042b4] to-[#002d80] text-white">
      {/* Header / Brand Logo */}
      <div className="flex h-20 items-center gap-3.5 px-6 shrink-0 pt-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 border border-white/20 text-white shadow-md shrink-0 backdrop-blur-xs">
          <WrenchIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="font-bold leading-tight text-white text-sm tracking-tight truncate">
            Bengkel Putra Motor
          </p>
          <p className="text-[11px] font-medium text-blue-200/80 mt-0.5 truncate">
            POS & Management
          </p>
        </div>
      </div>

      {/* Navigasi Utama */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 hide-scrollbar">
        {visibleItems.map((item) => (
          <SidebarItem
            key={item.to}
            item={item}
            navLocked={navLocked}
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* Profil User & Tombol Logout */}
      <div className="p-4 shrink-0 pb-6">
        <div className="flex items-center gap-3 rounded-2xl p-3 bg-white/10 border border-white/15 backdrop-blur-md">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#0042b4] shrink-0 font-bold text-xs shadow-xs">
            <UserIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white leading-tight">
              {user?.name}
            </p>
            <p className="truncate text-[10px] font-medium text-blue-200/80 mt-0.5">
              {user ? ROLE_LABEL[user.role] : ""}
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            aria-label="Keluar"
            className="h-8 w-8 p-0 text-blue-200/80 hover:text-[#0042b4] hover:bg-white rounded-xl shrink-0 transition-colors"
          >
            <LogoutIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}