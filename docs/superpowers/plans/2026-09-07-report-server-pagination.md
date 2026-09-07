# Server-Side Pagination for Report APIs

**Date:** 2026-09-07
**Status:** Approved
**Goal:** Add real server-side pagination to the 4 report GET endpoints (sales/services/inventory/finance) with matching frontend pagination controls, and correct the inaccurate `getInventoryReportApi` TS type.

## Audit Summary (drive for this plan)

The backend already returns every field `ReportsPage.tsx` consumes. Endpoints exist, are admin-only, and match the frontend contract `data.data` (`ApiResponse<T>`). The only genuine gaps:

1. Backend ignores `page`/`per_page` (frontend paginates locally via `PagedTable`) — no server-side pagination contract.
2. `getInventoryReportApi` TS type is inaccurate (`{ data: any[] }` vs real object shape).

## Key Design Decisions

- **Granularity: paginate detail lists only.** `summary` (and `payment_methods`, `by_status`) are always computed over the FULL date range so summary cards stay correct regardless of page. Only row lists (`transactions`, `expenses`, `top_services`, `orders`, `top_sold`, `low_stock`) are server-side paginated.
- **Pagination metadata:** returned per-list via Laravel `LengthAwarePaginator` (serializes to `{ data, current_page, last_page, per_page, total }`) under a `*_pagination` key next to the list (e.g. `transactions_pagination`, `orders_pagination`). This keeps `summary.*` reads unchanged.
- **N+1 safety:** eager loads + join aggregates already used; pagination actually reduces rows fetched.

## Tech Stack

Laravel 12 backend, React 18 + TypeScript + Vite frontend, Maatwebsite/DOMPDF exports (unchanged).

## Global Constraints

- Backend report routes are **admin-only** (`role:ADMIN`, `routes/api.php:110-116`) — do not change authorization.
- **Do not change** `summary.*` field names/values the frontend reads (`revenue`, `cogs`, `expenses`, `discount`, `voided`, `total_orders`, `by_status`, `service_revenue`, `total_products`, `low_stock_count`, `inventory_value`).
- **Do not touch** the export endpoints (`POST /reports/{type}/export`) nor `ReportSectionsExport` / `report.blade.php` — exports keep the full (unpaginated) datasets.
- Pagination params: `per_page` clamped `min(max(int,1),500)`, default **10** (matches `REPORT_PAGE_SIZE`). `page` default 1.
- Follow existing conventions: `min(max($request->integer('per_page', 10), 1), 500)` (see `ExpenseController.php:18`), Laravel `->paginate()`, frontend `Paginated<T>` = `{data,current_page,last_page,per_page,total}` (`types/index.ts:325`).
- TDD: write failing tests first. No comments unless matching existing style.

---

### Task 1: Backend — paginate `transactions` (sales) & `expenses` (finance)

**Files:**
- Modify: `backend/app/Services/Reports/ReportQueryService.php`
- Modify: `backend/app/Http/Controllers/Api/ReportController.php`
- Test: `backend/tests/Feature/Reports/ReportPaginationTest.php` (new)

**Interfaces:**
- Consumes: `Sale::paginate`, `Expense::paginate`, `LengthAwarePaginator`
- Produces: `ReportQueryService->sales(Carbon $from, Carbon $to, int $page, int $perPage): array` with `transactions` as paginator + `transactions_pagination`; `finance(...)` similarly with `expenses`/`expenses_pagination`.

- [ ] **Step 1:** Write failing tests — 15 paid sales → `transactions.data` 10 rows page 1, `total=15`, `last_page=2`; page 2 → 5 rows; 12 expenses → page 2 → 2 rows; clamp `per_page > 500` → 500.
- [ ] **Step 2:** Run → confirm fail (no pagination metadata currently).
- [ ] **Step 3:** Implement — `sales()`: replace `->get()` on transactions with `->paginate($perPage, ['*'], 'page', $page)`; keep summaries full-range; add `transactions_pagination`. Mirror in `finance()` for `expenses`.
- [ ] **Step 4:** Controller — `sales(Request)` and `finance(Request)` read `$page`/`$perPage` and pass through.
- [ ] **Step 5:** Run tests → green; full suite `php artisan test`.
- [ ] **Step 6:** Commit `feat(reports): server-side paginate sales transactions & finance expenses`.

### Task 2: Backend — paginate services & inventory row lists

**Files:**
- Modify: `backend/app/Services/Reports/ReportQueryService.php`
- Modify: `backend/app/Http/Controllers/Api/ReportController.php`
- Test: append to `backend/tests/Feature/Reports/ReportPaginationTest.php`

**Interfaces:**
- Consumes: Task 1 signatures.
- Produces: `services()` → `top_services`, `orders` paginated + `*_pagination` keys; `inventory()` → `top_sold`, `low_stock` paginated + keys. `summary` + `by_status` stay full.

- [ ] **Step 1:** Write failing tests — 15 orders → `orders` page 1 = 10 rows, `total=15`; 12 low-stock → `low_stock` page 2 = 2 rows; summaries stay full-range (not paginated).
- [ ] **Step 2:** Run → fail.
- [ ] **Step 3:** Implement — paginate `services.orders` + `services.top_services`; paginate `inventory.top_sold` + `inventory.low_stock` (paginate filtered collection).
- [ ] **Step 4:** Controller passes `page`/`perPage` for services & inventory.
- [ ] **Step 5:** Run tests → green; full suite.
- [ ] **Step 6:** Commit `feat(reports): server-side paginate services & inventory lists`.

### Task 3: Frontend — paginated fetching + controlled PagedTable

**Files:**
- Modify: `frontend/src/lib/api/reports.ts`
- Modify: `frontend/src/types/index.ts` (correct `getInventoryReportApi` typing)
- Modify: `frontend/src/features/reports/ReportsPage.tsx`

**Interfaces:**
- Consumes: backend `*_pagination` = `Paginated<T>` (`types/index.ts:325`).
- Produces: `ReportsPage` per-list state `{ rows, current_page, last_page, total }`; `PagedTable` controlled `({ columns, rows, page, lastPage, total, onPageChange, keyExtractor })`.

- [ ] **Step 1:** Update API client — add `page`/`per_page` to `ReportParams`, fix `getInventoryReportApi` return type.
- [ ] **Step 2:** Convert `ReportsPage` state to per-list paginated state keyed by tab.
- [ ] **Step 3:** Rework `PagedTable` to server-driven (passed `page`/`lastPage`/`total` + `onPageChange`; `load(page)` refetches).
- [ ] **Step 4:** Wire each report view to its `*_pagination` metadata.
- [ ] **Step 5:** Run `npm run typecheck && npm run lint && npm run build`.
- [ ] **Step 6:** Commit `feat(reports): use server-side pagination in report UI`.

### Task 4: Verification + docs

- [ ] **Step 1:** Backend `php artisan test` full suite green.
- [ ] **Step 2:** Frontend typecheck/lint/build green.
- [ ] **Step 3:** Manual smoke — open each tab, click pages, confirm summaries unchanged.
- [ ] **Step 4:** Commit any doc touch if needed.

---

**Self-review:** Spec coverage complete (both gaps addressed); export untouched; placeholders none; `Paginated<T>` + `*_pagination` naming consistent across tasks.