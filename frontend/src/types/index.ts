// ===== Shared domain types matching backend Schema =====

export type Role = "ADMIN" | "CASHIER";
export type SaleStatus = "DRAFT" | "PENDING" | "PAID" | "EXPIRED" | "VOID";
export type ServiceOrderStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type PaymentMethod = "CASH" | "QRIS" | "VA";
export type StockMovementType =
  | "OPENING"
  | "PURCHASE"
  | "SALE"
  | "ADJUSTMENT"
  | "VOID_RETURN";
export type StockDirection = "IN" | "OUT";
export type SaleItemType = "PRODUCT" | "SERVICE";

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Mechanic {
  id: number;
  name: string;
  phone?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  motorcycle_type?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  unit: string;
  purchase_price: number; // Admin only
  sale_price: number;
  current_stock: number;
  min_stock: number;
  is_active: boolean;
  image?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Product as seen by Cashier (purchase_price hidden by backend)
export type ProductForCashier = Omit<Product, "purchase_price">;

export interface Service {
  id: number;
  code: string;
  name: string;
  sale_price: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ServiceOrder {
  id: number;
  order_code: string;
  customer_id: number;
  motorcycle_type?: string | null;
  cashier_id: number;
  mechanic_id?: number | null;
  complaint: string;
  diagnosis_note?: string | null;
  status: ServiceOrderStatus;
  opened_at: string;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  customer?: Customer;
  mechanic?: Mechanic | null;
  cashier?: User;
  sale?: Sale | null;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  item_type: SaleItemType;
  product_id?: number | null;
  service_id?: number | null;
  item_code_snapshot?: string | null;
  item_name_snapshot: string;
  quantity: number;
  unit_price: number;
  purchase_price_snapshot?: number | null; // Admin/Cashier? backend hides for Cashier
  subtotal: number;
  created_at?: string;
  updated_at?: string;
}

export interface Sale {
  id: number;
  sale_code: string;
  cashier_id: number;
  customer_id?: number | null;
  service_order_id?: number | null;
  status: SaleStatus;
  subtotal: number;
  discount_amount: number;
  grand_total: number;
  payment_method?: PaymentMethod | null;
  paid_amount?: number | null;
  change_amount?: number | null;
  paid_at?: string | null;
  voided_at?: string | null;
  voided_by?: number | null;
  void_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  items?: SaleItem[];
  cashier?: User;
  customer?: Customer | null;
  payment_expires_at?: string | null;
  gateway_transaction_id?: string | null;
  gateway_type?: string | null;
  gateway_va_number?: string | null;
  gateway_qr_url?: string | null;
  gateway_qr_string?: string | null;
  gateway_deeplink?: string | null;
}

export interface StockMovement {
  id: number;
  product_id: number;
  type: StockMovementType;
  direction: StockDirection;
  quantity_change: number;
  stock_before: number;
  stock_after: number;
  sale_id?: number | null;
  sale_code?: string | null;
  created_by: number;
  created_by_name?: string | null;
  note?: string | null;
  created_at: string;
  product?: Product;
  expense_amount?: number | null;
}

export interface LowStockItem {
  id: number;
  sku: string;
  name: string;
  current_stock: number;
  min_stock: number;
  unit: string;
  is_out: boolean;
}

export interface LowStockCounts {
  out_of_stock: number;
  low: number;
  total: number;
}

export interface Expense {
  id: number;
  expense_date: string;
  category: string;
  amount: number;
  description?: string | null;
  created_by: number;
  source?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  payment_method?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLog {
  id: number;
  user_id?: number | null;
  action: string;
  entity_type: string;
  entity_id?: number | null;
  before_data?: any | null;
  after_data?: any | null;
  reason?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
  user?: User | null;
}

// ===== Dashboard =====

export interface DashboardKpi {
  // New period-based fields (primary - follow selected date range)
  period_revenue: number;
  period_transactions: number;
  period_service_orders: number;
  period_expenses: number;
  period_revenue_vs_prev_pct: number;
  period_transactions_vs_prev_pct: number;
  period_service_orders_vs_prev_pct: number;
  period_expenses_vs_prev_pct: number;

  // Estimated result follows the selected period
  estimated_result: number;

  // Month figures (current calendar month, independent of filter)
  month_revenue: number;
  month_expenses: number;

  // Real-time fields (not date-filtered)
  low_stock_count: number;
  void_count_today: number;

  // Backward compatibility aliases (deprecated - kept for existing consumers)
  today_revenue?: number;
  today_transactions?: number;
  today_service_orders?: number;
  today_expenses?: number;
  today_revenue_vs_yesterday_pct?: number;
  today_transactions_vs_yesterday_pct?: number;
  today_service_orders_vs_yesterday_pct?: number;
  today_expenses_vs_yesterday_pct?: number;
  low_stock_count_vs_yesterday_pct?: number;
  void_count_today_vs_yesterday_pct?: number;
}

export interface RevenueBreakdown {
  products: number;
  services: number;
  // New field names (primary - vs previous period of same duration)
  products_vs_prev_pct: number;
  services_vs_prev_pct: number;
  // Backward compatibility aliases
  products_vs_yesterday_pct?: number;
  services_vs_yesterday_pct?: number;
}

export interface DashboardChartPoint {
  date: string;
  revenue: number;
}

export interface TopSeller {
  product_id: number;
  name: string;
  total_qty: number;
  total_revenue: number;
}

export interface TopService {
  service_id: number;
  name: string;
  total_qty: number;
  total_revenue: number;
}

export interface DashboardData {
  kpi: DashboardKpi;
  revenue_series: DashboardChartPoint[];
  revenue_breakdown: RevenueBreakdown;
  top_products: TopSeller[];
  top_services: TopService[];
  low_stock: Product[];
  recent_sales: Sale[];
  recent_voids: Sale[];
}

// Notification types
export type NotificationType = "STOCK" | "TRANSACTION";

export interface Notification {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  product_id?: number | null;
  product_image?: string | null;
  image?: string | null;
  data?: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationCounts {
  stock: number;
  transaction: number;
  total: number;
}

// ===== API response wrapper =====

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  retryAfter?: number;
  errors?: Record<string, string[]>;
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}