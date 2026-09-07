# Payment Gateway Verification & Graceful Fallback

Date: 2026-09-07
Status: Ready to execute
Branch: `feature/payment-gateway-fallback`

## Goal

Verify the existing payment gateway integration (CASH / QRIS / VA bank) for
production readiness and add a graceful fallback when the REAL gateway
(Midtrans) is down or unreachable during an online (QRIS/VA) checkout:

- When gateway `createCharge` fails (5xx, connection error), the backend
  returns a friendly **503** `PAYMENT_GATEWAY_UNAVAILABLE` including the
  `sale_id`, and the frontend directs the cashier to use **Tunai (CASH)**
  instead of crashing or silently creating a PENDING sale with no charge.
- The failed checkout rolls back cleanly: the sale stays `DRAFT`, stock is
  NOT decremented, no charge row is created, so the same sale can immediately
  be re-checked-out as CASH.
- Add missing coverage: VA online checkout feature test, gateway error unit
  tests, simulate-403 security test, and a full payment smoke-test script.
- Fix a countdown-text mismatch (10 menit vs. 5 menit) in the (currently
  unused) `WaitingPaymentModal.tsx`.

## Context

- Gateway binding lives in `backend/app/Providers/AppServiceProvider.php:19-25`:
  empty `MIDTRANS_SERVER_KEY` → `FakePaymentGateway`, set → `MidtransGateway`.
  **The plan does NOT modify this file, `config/services.php`, routes, or
  migrations.** With the local `.env` (empty key) the running app uses
  `FakePaymentGateway`, so real-mode behavior is exercised via tests that bind
  `MidtransGateway` + `Http::fake`.
- `backend/app/Services/Payments/PaymentService.php:36-94`: `startOnlinePayment`
  opens its own `DB::transaction`; stock is decremented (line 49) then
  `createCharge` called (lines 51-63). If `createCharge` throws, the exception
  propagates out of the transaction and **everything rolls back** — sale stays
  DRAFT, stock untouched. This is the foundation of the fallback.
- `backend/app/Services/Payments/Gateways/MidtransGateway.php:49-55`: HTTP call,
  `if (!$response->successful()) throw new RuntimeException('Payment gateway error: ...', $response->status())`.
  Connection failure throws `Illuminate\Http\Client\ConnectionException`
  (import from `Illuminate\Http\Client\ConnectionException`).
- `backend/app/Http/Controllers/Api/SaleController.php:192-200`: `checkout`
  catches `RuntimeException` and returns `CHECKOUT_FAILED`. A new catch for
  `PaymentGatewayUnavailableException` must be inserted **BEFORE** it
  (the typed exception extends `RuntimeException`).
- `backend/config/services.php:38-45`: sandbox charge URL is
  `https://api.sandbox.midtrans.com/v2` (because `MIDTRANS_IS_PRODUCTION=false`
  when not set). `Http::fake` patterns must target `api.sandbox.midtrans.com/*`.
- Frontend: `frontend/src/features/pos/PosPage.tsx` `doCheckout` (~lines
  383-447). `frontend/src/lib/api/client.ts` interceptor passes
  `message/code/status/retryAfter/errors` through to the ApiError — it does
  **NOT** pass `sale_id`, so the frontend must capture the sale id itself
  (client-side ref) instead of reading `err.sale_id`. `client.ts` and
  `frontend/src/types/index.ts` are NOT modified.
- `frontend/src/features/pos/WaitingPaymentModal.tsx` is dead code (not
  imported anywhere) but still references "10 menit" at lines 48, 82
  (`progress = timeLeft / (10 * 60)`), and 336 — the true expiry is 5 minutes.
- Existing tests to follow for patterns: `backend/tests/Feature/Payments/*`
  (bind gateway instance in `setUp`), `backend/tests/Unit/Services/MidtransGatewayTest.php`,
  and the smoke-test pattern `backend/scripts/whatsapp-smoke-test.php`
  (run via `php artisan tinker --execute="require 'scripts/payment-smoke-test.php';"`).

## Global Constraints

1. **No schema/migration/route changes.** No changes to
   `AppServiceProvider.php`, `config/services.php`, `client.ts`,
   `types/index.ts`, `routes/api.php`.
2. **Contract (backend → frontend)**: HTTP `503` with JSON
   `{ message, code: "PAYMENT_GATEWAY_UNAVAILABLE", sale_id, errors: [] }`.
   The message must suggest cash: the constant text is
   `Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.`
3. **Rollback invariant**: on fallback, the sale stays `DRAFT`, no
   `payment_charges` row for that attempt, stock unchanged.
4. **No real gateway keys** committed anywhere. Tests use `Http::fake` with
   pattern `api.sandbox.midtrans.com/*`.
5. **Existing tests must keep passing** (backend suite was 249 tests / 795
   assertions green before this work; frontend typecheck + build green).
6. **No comments added** unless already present style requires it; follow
   existing code style (2-space indent, named args in PHP where relevant).
7. **Frontend UX**: on `PAYMENT_GATEWAY_UNAVAILABLE`, keep the same DRAFT sale
   and retry object, switch the selected method to `CASH`, show a `toast.error`
   with the backend message, do NOT clear the cart/modal. `retrySaleIdRef` is
   reset in `handleClosePaymentModal`, on success, and in non-fallback error
   branches.
8. Tests are written test-first (RED → GREEN) where the plan says test-first,
   and run with focused commands before the full suite.

---

## Task 1: Backend graceful fallback for gateway failures (test-first)

**Files**
- CREATE `backend/app/Exceptions/PaymentGatewayUnavailableException.php`
- MODIFY `backend/app/Services/Payments/PaymentService.php`
- MODIFY `backend/app/Http/Controllers/Api/SaleController.php`
- CREATE `backend/tests/Feature/Payments/PaymentGatewayFallbackTest.php`

**Steps**

1. **RED — write the tests first** in
   `backend/tests/Feature/Payments/PaymentGatewayFallbackTest.php`
   (namespace `Tests\Feature\Payments`, extends `Tests\TestCase`):
   - `setUp()`: create cashier via `$this->cashier()`, `$this->actingAs($cashier)`,
     and bind the gateway the test needs. Use `MidtransGateway` bound via
     `$this->app->instance(PaymentGateway::class, new MidtransGateway())` with
     `config(['services.midtrans.server_key' => 'SB-Mid-server-test'])` and
     `Http::fake(...)` per test. Import
     `Illuminate\Http\Client\ConnectionException`.
   - Helper `makeSale()` mirroring `OnlineCheckoutTest::test_checkout_with_qris...`:
     sale factory for the cashier, one product line (`sale_price=1000`,
     `current_stock=10`, qty 2), `subtotal`/`grand_total` = 2000.
   - **Test 1** `test_checkout_qris_returns_503_payment_gateway_unavailable_when_gateway_5xx`:
     `Http::fake(['api.sandbox.midtrans.com/*' => Http::response('Service Unavailable', 503, ['Content-Type' => 'application/json'])])`; POST
     `/api/v1/sales/{$sale->id}/checkout` with `payment_method=QRIS`; assert:
     `assertStatus(503)`, `assertJsonPath('code', 'PAYMENT_GATEWAY_UNAVAILABLE')`,
     `assertJsonPath('sale_id', $sale->id)`,
     `assertJsonPath('message', 'Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.')`;
     reload the sale → assert `status === Sale::STATUS_DRAFT`;
     reload product → assert `current_stock === 10`;
     `assertDatabaseCount('payment_charges', 0)`.
   - **Test 2** `test_checkout_qris_returns_503_payment_gateway_unavailable_when_gateway_connection_error`:
     `Http::fake(['api.sandbox.midtrans.com/*' => fn () => throw new ConnectionException('Connection refused')])`; same POST/asserts as Test 1
     (status 503, code, sale DRAFT, stock 10, no charges).
   - **Test 3** `test_cash_checkout_on_same_sale_after_gateway_fallback`:
     same failing 5xx fake; POST QRIS → assert 503; then POST the SAME sale
     with `payment_method=CASH, paid_amount=2000` → `assertOk()` and
     `assertJsonPath('data.status', 'PAID')`; product stock `=== 8`
     (decremented exactly once for the successful cash sale).
   - Run the file, confirm the failing tests (RED) for the new exception class.

2. **CREAT**E `backend/app/Exceptions/PaymentGatewayUnavailableException.php`:
   - `namespace App\Exceptions;` — extends `RuntimeException`.
   - Plain property `public ?int $saleId = null;` (NO promoted constructor
     property, to keep plain `RuntimeException` compatibility).
   - `public function __construct(int $saleId, string $message = 'Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.')`
     → `parent::__construct($message, 503); $this->saleId = $saleId;`

3. **MODIFY** `PaymentService::startOnlinePayment`: wrap ONLY the
   `createCharge` call (lines 51-63) in `try { ... } catch (\Throwable $e) {
   Log::warning('Payment gateway unavailable: '.$e->getMessage(), ['sale_id' => $sale->id, 'method' => $method]);
   throw new PaymentGatewayUnavailableException($sale->id); }`.
   Add `use App\Exceptions\PaymentGatewayUnavailableException;` and
   `use Illuminate\Support\Facades\Log;`. Other code paths untouched.

4. **MODIFY** `SaleController::checkout`: import
   `App\Exceptions\PaymentGatewayUnavailableException`; add **before** the
   existing `RuntimeException` catch:
   ```php
   } catch (PaymentGatewayUnavailableException $e) {
       return response()->json([
           'message' => $e->getMessage(),
           'code' => 'PAYMENT_GATEWAY_UNAVAILABLE',
           'sale_id' => $e->saleId,
           'errors' => [],
       ], 503);
   }
   ```

5. **GREEN** — run:
   `php artisan test tests/Feature/Payments/PaymentGatewayFallbackTest.php tests/Feature/Payments/OnlineCheckoutTest.php tests/Feature/Payments/PaymentSecurityTest.php`
   → all pass. Then run the full suite once:
   `php artisan test`.

6. Commit: `feat(payments): graceful 503 fallback when payment gateway unavailable`.

**Verify**: Test 3 proves the same DRAFT sale is reusable as CASH after a
fallback (stock decremented exactly once); Tests 1-2 prove rollback of stock,
DRAFT status, and zero charges. Full backend suite green.

---

## Task 2: VA online checkout test + gateway error + simulate-403 tests

**Files**
- MODIFY `backend/tests/Feature/Payments/OnlineCheckoutTest.php`
- MODIFY `backend/tests/Unit/Services/MidtransGatewayTest.php`
- MODIFY `backend/tests/Feature/Payments/PaymentSecurityTest.php`

**Steps**

1. **VA feature test** in `OnlineCheckoutTest`:
   `test_checkout_with_va_creates_pending_sale_and_charge` mirroring the QRIS
   test (same sale/product setup, `Http` not needed — FakePaymentGateway) with
   `payment_method='VA'`; assert `200`, `data.status=PENDING`, charge exists
   with `method='VA'`, product stock decremented (10 → 8).

2. **Gateway error unit tests** in `MidtransGatewayTest`:
   - `test_create_charge_throws_runtime_exception_on_5xx`:
     `Http::fake(['api.sandbox.midtrans.com/v2/charge' => Http::response('error', 500)])`;
     `expectException(RuntimeException::class)`;
     build a `PendingChargeRequest` (orderId 1, saleCode 'SALE-001', method
     'QRIS', grossAmount '90000.00', one item); call `createCharge`;
     Optionally assert `$e->getCode() === 500` via try/catch.
   - `test_create_charge_propagates_connection_exception`:
     `Http::fake(['api.sandbox.midtrans.com/v2/charge' => fn () => throw new ConnectionException('Connection refused')])`;
     `expectException(ConnectionException::class)`; same request; call
     `createCharge`.
   - Import `Illuminate\Http\Client\ConnectionException` and `RuntimeException`.

3. **Simulate-403 security test** in `PaymentSecurityTest`:
   `test_simulate_payment_returns_403_outside_development`: create a PENDING
   QRIS sale+charge (reuse `createPendingSaleWithCharge()` pattern; note the
   route is unauthenticated); `assertStatus(403)` on
   `POST /api/v1/payments/simulate/{$sale->sale_code}`. The controller returns
   403 when `!app()->environment('local') && !config('app.debug')` (in the test
   env `APP_ENV=testing`, `APP_DEBUG=false`, so it is 403).

4. Run focused: `php artisan test tests/Feature/Payments tests/Unit/Services/MidtransGatewayTest.php`.
   Then full suite: `php artisan test`.

5. Commit: `test(payments): VA checkout, gateway 5xx/connection, simulate-403`.

**Verify**: all new tests pass; existing payment tests still green.

---

## Task 3: Frontend fallback UX + 5-minute countdown text fix

**Files**
- MODIFY `frontend/src/features/pos/PosPage.tsx`
- MODIFY `frontend/src/features/pos/WaitingPaymentModal.tsx`

**Steps**

1. **PosPage.tsx — add retry id ref & fallback handling** in `doCheckout`
   (lines ~383-447):
   - Add `const retrySaleIdRef = useRef<number | null>(null);` near the other refs
     (~line 93).
   - In `doCheckout`, replace the unconditional `createSaleApi` so a retry
     reuses the existing DRAFT sale: if `retrySaleIdRef.current` is set, fetch
     it with `getSaleApi(retrySaleIdRef.current)`; use that sale for checkout
     if still `DRAFT`, otherwise clear the ref and `createSaleApi` a new one.
     Set `retrySaleIdRef.current = sale.id` immediately after `createSaleApi`.
   - In the `catch`, BEFORE the existing `err.errors` handling, branch:
     ```ts
     if (err.code === "PAYMENT_GATEWAY_UNAVAILABLE") {
       setPaymentMethod("CASH");
       toast.error(err.message || "Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.");
       return;
     }
     ```
     Do NOT clear `retrySaleIdRef` in that branch (the DRAFT sale must be
     reusable). Keep the existing fallback `toast.error` for other errors but
     ALSO clear `retrySaleIdRef.current = null` in that non-fallback branch.
   - On success (both CASH and online PENDING paths) clear `retrySaleIdRef.current = null`.
   - In `handleClosePaymentModal` (~line 293): add `retrySaleIdRef.current = null;`.
   - `err` type at line 437 already includes `code?: string` — extend the cast
     to `{ message?: string; code?: string; errors?: Record<string, string[]> }`
     if needed.

2. **WaitingPaymentModal.tsx — fix countdown text** (dead code but referenced):
   - Line 48: `"Waktu pembayaran habis (10 menit)"` → `"Waktu pembayaran habis (5 menit)"`.
   - Line 82: `const progress = timeLeft / (10 * 60);` → `timeLeft / (5 * 60)`.
   - Line 336: `"Waktu pembayaran (10 menit) telah habis..."` → `"(5 menit)"`.
   No other logic changes.

3. Verify frontend:
   `cd frontend && npm run typecheck && npm run lint && npm run build`.

4. Commit: `feat(pos): graceful cash fallback on payment gateway outage; fix 5-min countdown text`.

**Verify**: typecheck, lint, build all pass. Manually reasoned path: QRIS
checkout with real key configured + gateway down → 503 toast, method switches
to CASH, sale reused on retry.

---

## Task 4: Payment smoke-test script

**Files**
- CREATE `backend/scripts/payment-smoke-test.php`

**Steps**

1. Mirror the structure of `backend/scripts/whatsapp-smoke-test.php`:
   header comment (Indonesian, explains simulation mode + run command + notes),
   runtime config overrides, `$state`/`$check` closure, unique test data
   generation, try/catch/finally, cleanup gated by `KEEP_TEST_DATA`, summary +
   `exit($state['failures'] > 0 ? 1 : 0)`.

2. Runtime overrides at top:
   ```php
   config(['services.midtrans.server_key' => '']);   // force FakePaymentGateway
   config(['queue.default' => 'sync']);
   config(['broadcasting.default' => 'null']);
   ```
   (`MIDTRANS_IS_PRODUCTION` stays false → sandbox URL if ever real-faked.)

3. Fixtures: create/get a cashier (`App\Models\User`; e.g.
   `User::where('email', 'admin@bengkel.test')->first()`), `Auth::login($cashier)`,
   and a product with `current_stock = 50, sale_price = 10000`. Build sales via
   `Sale` factory + one product line (qty 2) with snapshot fields, then run
   checkout through `app(\App\Services\Sales\CheckoutSaleService::class)`
   (CASH tests need `paid_amount >= grand_total`).

4. Scenarios (labels + asserts via `$check`, unique `sale_code` per sale,
   `sale_code = 'SMK-' . strtoupper(substr(bin2hex(random_bytes(4)),0,8))`):
   - **P1 CASH** → status `PAID`, `assertDatabaseCount('payment_charges', 0)` for that sale.
   - **P2 QRIS (Fake)** → status `PENDING`, one charge with `gateway_type=qris`,
     `qr_url` present, settle via `paymentService->settleFromGateway(...)`
     (`status PAID`).
   - **P3 VA (Fake)** → status `PENDING`, charge `gateway_type=bank_transfer`,
     `va_number=1234567890`.
   - **P4 Webhook settle** → build `GatewayNotification(orderId: sale_code,
     status: 'PAID', grossAmount, gatewayTransactionId)` and call
     `settleFromGateway` → status `PAID`, `paid_at` not null.
   - **P5 Double-settle idempotent** → settle twice → first `PAID`, second call
     returns same sale, only ONE `payment_charges` row `status=PAID`.
   - **P6 Expire** → `paymentService->expire($sale)` → status `EXPIRED`, charge
     `status=EXPIRED`, product stock restored.
   - **P7 Amount mismatch** → `settleFromGateway` with wrong `grossAmount`
     → expect `RuntimeException('Amount mismatch.', 422)` (try/catch assert).
   - **P8 Real-gateway fallback** → inside a sub-scope: set
     `config(['services.midtrans.server_key' => 'SB-Mid-server-smoke'])` AND
     `Http::fake(['api.sandbox.midtrans.com/*' => Http::response('Service Unavailable', 503)])`,
     `app()->forgetInstance(\App\Services\Payments\Contracts\PaymentGateway::class)`
     so the provider rebinds `MidtransGateway`; run QRIS checkout → catch
     `App\Exceptions\PaymentGatewayUnavailableException`, assert `$e->getCode() === 503`,
     message contains `tunai`, `$e->saleId === $sale->id`, sale still
     `DRAFT`, stock NOT decremented; then run the SAME sale as CASH → `PAID`,
     stock decremented once. Reset config/server key/Http after (set key back
     to `''` and `http` unprevent-strays/empty fake).

5. Cleanup (finally, unless `KEEP_TEST_DATA=1`): delete created sales and their
   `sale_items` + `payment_charges`, restore product `current_stock` to 50,
   delete created notifications for those sales. Print `[Cleanup] ...` like the
   WhatsApp script.

6. Run: `php artisan tinker --execute="require 'scripts/payment-smoke-test.php';"`
   → expect all P1–P8 PASS and exit code 0. Run it a second time to prove
   determinism.

7. Commit: `test(payments): add payment smoke-test script (P1-P8)`.

**Verify**: script passes on both runs; exit 0; cleanup verified.

---

## Task 5: .env.example docs + full verification

**Files**
- MODIFY `backend/.env.example`

**Steps**

1. In the `# PAYMENT GATEWAY - MIDTRANS` block (~lines 66-94), add a short
   paragraph under the existing sections documenting the outage fallback:
   when the real gateway is configured but unreachable/returns 5xx during a
   QRIS/VA checkout, the backend returns HTTP 503 with
   `code: PAYMENT_GATEWAY_UNAVAILABLE` and the frontend automatically suggests
   switching to tunai (CASH) while keeping the transaction as a valid DRAFT.
   Keep it in Indonesian to match the file.

2. Final verification (from repo root):
   - Backend: `cd backend && php artisan test` → all green.
   - Smoke test: `php artisan tinker --execute="require 'scripts/payment-smoke-test.php';"` twice → PASS both.
   - Frontend: `cd frontend && npm run typecheck && npm run lint && npm run build` → all green.

3. Commit: `docs(env): document payment gateway outage fallback behavior`.

**Verify**: full suite + smoke + frontend all green; `.env.example` documents
the fallback.