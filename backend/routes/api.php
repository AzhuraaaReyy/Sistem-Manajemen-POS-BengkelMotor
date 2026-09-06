<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\MechanicController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\ServiceOrderController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PaymentWebhookController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\SearchController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| Prefix: /api/v1
*/

Route::prefix('v1')->group(function () {

    // Public webhook (CSRF-exempt; signature-verified; rate-limited).
    Route::post('payments/webhook/midtrans', [PaymentWebhookController::class, 'handle'])
        ->middleware('throttle:30,1');

    // WhatsApp Webhook (public, rate-limited, CSRF-exempt)
    Route::get('whatsapp/webhook', [App\Http\Controllers\Api\WhatsAppWebhookController::class, 'verify']);
    Route::post('whatsapp/webhook', [App\Http\Controllers\Api\WhatsAppWebhookController::class, 'handle'])
        ->middleware('throttle:60,1');

    // Payment simulation (development only)
    Route::post('payments/simulate/{saleCode}', [PaymentWebhookController::class, 'simulatePayment'])
        ->middleware('throttle:10,1');

    // Public: auth (sesi dimulai oleh prepend di bootstrap/app.php sehingga
    // Sanctum SPA cookie auth dapat mempertahankan user antar request).
    Route::prefix('auth')->group(function () {
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::post('logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
        Route::get('me', [AuthController::class, 'me'])->middleware('auth:sanctum');
    });

    // Protected API (sesi dimulai oleh prepend di bootstrap/app.php).
    // throttle:api protects heavy endpoints (dashboard/report/export) from DoS.
    Route::group(['middleware' => ['auth:sanctum', 'throttle:api']], function () {

        // Global Search
        Route::get('search', [SearchController::class, 'index']);

        // Dashboard (Admin only)
        Route::get('dashboard', [DashboardController::class, 'index'])
            ->middleware(['role:ADMIN', 'throttle:heavy']);

        // Sales / POS
        Route::get('sales', [SaleController::class, 'index']);
        Route::post('sales', [SaleController::class, 'store']);
        Route::get('sales/{sale}', [SaleController::class, 'show']);
        Route::put('sales/{sale}', [SaleController::class, 'update']);
        Route::post('sales/{sale}/checkout', [SaleController::class, 'checkout']);
        Route::post('sales/{sale}/void', [SaleController::class, 'void'])->middleware('role:ADMIN,CASHIER');
        Route::post('sales/{sale}/expire', [SaleController::class, 'expire'])->middleware('role:ADMIN,CASHIER');

        // Products
        Route::get('products', [ProductController::class, 'index']);
        // Must be declared before products/{product} (static > dynamic).
        Route::get('products/low-stock', [ProductController::class, 'lowStock']);
        Route::get('products/{product}', [ProductController::class, 'show']);
        Route::get('products/{product}/movements', [ProductController::class, 'movements']);
        Route::post('products', [ProductController::class, 'store'])->middleware('role:ADMIN');
        Route::put('products/{product}', [ProductController::class, 'update'])->middleware('role:ADMIN');
        // Stock management (adjust/restock) — Admin & Cashier
        Route::post('products/{product}/adjust-stock', [ProductController::class, 'adjustStock'])->middleware('role:ADMIN,CASHIER');

        // Services (jasa)
        Route::get('services', [ServiceController::class, 'index']);
        Route::post('services', [ServiceController::class, 'store'])->middleware('role:ADMIN');
        Route::put('services/{service}', [ServiceController::class, 'update'])->middleware('role:ADMIN');

        // Customers
        Route::get('customers', [CustomerController::class, 'index']);
        Route::get('customers/{customer}', [CustomerController::class, 'show']);
        Route::post('customers', [CustomerController::class, 'store'])->middleware('role:ADMIN,CASHIER');
        Route::put('customers/{customer}', [CustomerController::class, 'update'])->middleware('role:ADMIN,CASHIER');

        // Mechanics
        Route::get('mechanics', [MechanicController::class, 'index']);
        Route::post('mechanics', [MechanicController::class, 'store'])->middleware('role:ADMIN');
        Route::put('mechanics/{mechanic}', [MechanicController::class, 'update'])->middleware('role:ADMIN');

        // Service Orders
        Route::get('service-orders', [ServiceOrderController::class, 'index']);
        Route::get('service-orders/{serviceOrder}', [ServiceOrderController::class, 'show']);
        Route::post('service-orders', [ServiceOrderController::class, 'store']);
        Route::put('service-orders/{serviceOrder}', [ServiceOrderController::class, 'update'])->middleware('role:ADMIN,CASHIER');
        Route::delete('service-orders/{serviceOrder}', [ServiceOrderController::class, 'destroy'])->middleware('role:ADMIN,CASHIER');

        // Expenses (Admin only)
        Route::get('expenses', [ExpenseController::class, 'index'])->middleware('role:ADMIN');
        Route::post('expenses', [ExpenseController::class, 'store'])->middleware('role:ADMIN');
        Route::put('expenses/{expense}', [ExpenseController::class, 'update'])->middleware('role:ADMIN');

        // Reports (Admin only)
        Route::get('reports/sales', [ReportController::class, 'sales'])->middleware(['role:ADMIN', 'throttle:heavy']);
        Route::get('reports/services', [ReportController::class, 'services'])->middleware(['role:ADMIN', 'throttle:heavy']);
        Route::get('reports/inventory', [ReportController::class, 'inventory'])->middleware(['role:ADMIN', 'throttle:heavy']);
        Route::get('reports/finance', [ReportController::class, 'finance'])->middleware(['role:ADMIN', 'throttle:heavy']);
        Route::post('reports/{type}/export', [ReportController::class, 'export'])
            ->whereIn('type', ['sales', 'services', 'inventory', 'finance'])
            ->middleware(['role:ADMIN', 'throttle:heavy']);

        // Users (Admin only)
        Route::get('users', [UserController::class, 'index'])->middleware('role:ADMIN');
        Route::post('users', [UserController::class, 'store'])->middleware('role:ADMIN');
        Route::put('users/{user}', [UserController::class, 'update'])->middleware('role:ADMIN');

        // Audit logs (Admin only)
        Route::get('audit-logs', [AuditController::class, 'index'])->middleware('role:ADMIN');

        // WhatsApp Chat Management (Admin only)
        Route::get('whatsapp/chats', [App\Http\Controllers\Api\WhatsAppChatController::class, 'index'])->middleware('role:ADMIN');
        Route::get('whatsapp/chats/{chat}', [App\Http\Controllers\Api\WhatsAppChatController::class, 'show'])->middleware('role:ADMIN');
        Route::post('whatsapp/chats/{chat}/takeover', [App\Http\Controllers\Api\WhatsAppChatController::class, 'takeover'])->middleware('role:ADMIN');
        Route::post('whatsapp/chats/{chat}/release', [App\Http\Controllers\Api\WhatsAppChatController::class, 'release'])->middleware('role:ADMIN');
        Route::post('whatsapp/chats/{chat}/send', [App\Http\Controllers\Api\WhatsAppChatController::class, 'sendMessage'])->middleware('role:ADMIN');

        // Booking Approval (Admin only)
        Route::post('whatsapp/bookings/{booking}/approve', [App\Http\Controllers\Api\WhatsAppBookingController::class, 'approve'])->middleware('role:ADMIN');
        Route::post('whatsapp/bookings/{booking}/reject', [App\Http\Controllers\Api\WhatsAppBookingController::class, 'reject'])->middleware('role:ADMIN');

        // Notifications
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
        Route::post('notifications/{notification}/read', [NotificationController::class, 'markAsRead']);
        Route::post('notifications/read-all', [NotificationController::class, 'markAllAsRead']);
        Route::delete('notifications/{notification}', [NotificationController::class, 'destroy']);
    });
});
