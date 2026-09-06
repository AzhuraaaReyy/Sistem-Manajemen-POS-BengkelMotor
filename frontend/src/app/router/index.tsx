import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/app/auth/AuthContext";
import type { ReactNode } from "react";
import type { Role } from "@/types";
import { AppShell } from "@/components/layout/AppShell";
import { ReceiptShell } from "@/components/layout/ReceiptShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { PosPage } from "@/features/pos/PosPage";
import { ProductsPage } from "@/features/products/ProductsPage";
import { ServicesPage } from "@/features/services/ServicesPage";
import { ExpensesPage } from "@/features/expenses/ExpensesPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { SalesHistoryPage } from "@/features/sales-history/SalesHistoryPage";
import { ReceiptPage } from "@/features/sales-history/ReceiptPage";
import { UsersPage } from "@/features/users/UsersPage";
import { AuditPage } from "@/features/audit/AuditPage";
import { WhatsAppChatsPage } from "@/features/whatsapp/WhatsAppChatsPage";
import { LoadingState } from "@/components/ui/LoadingState";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Memuat..." />
      </div>
    );
  }
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
    } else if (!roles.includes(user.role)) {
      navigate("/pos", { replace: true });
    }
  }, [isLoading, user, roles, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Memuat..." />
      </div>
    );
  }
  if (!user || !roles.includes(user.role)) return null;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: "dashboard",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <DashboardPage />
          </RequireRole>
        ),
      },
      { path: "pos", element: <PosPage /> },
      { path: "riwayat", element: <SalesHistoryPage /> },
      { path: "produk", element: <ProductsPage /> },
      { path: "produk/:id", element: <ProductsPage /> },
      { path: "jasa", element: <ServicesPage /> },
      {
        path: "pengeluaran",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <ExpensesPage />
          </RequireRole>
        ),
      },
      {
        path: "laporan",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <ReportsPage />
          </RequireRole>
        ),
      },
      {
        path: "pengguna",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <UsersPage />
          </RequireRole>
        ),
      },
      {
        path: "audit",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <AuditPage />
          </RequireRole>
        ),
      },
      {
        path: "whatsapp-chats",
        element: (
          <RequireRole roles={["ADMIN"]}>
            <WhatsAppChatsPage />
          </RequireRole>
        ),
      },
    ],
  },
  {
    path: "riwayat/:id/struk",
    element: (
      <RequireAuth>
        <ReceiptShell>
          <ReceiptPage />
        </ReceiptShell>
      </RequireAuth>
    ),
  },
  {
    path: "pos/struk/:id",
    element: (
      <RequireAuth>
        <ReceiptShell>
          <ReceiptPage />
        </ReceiptShell>
      </RequireAuth>
    ),
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
