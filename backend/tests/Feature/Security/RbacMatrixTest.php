<?php

namespace Tests\Feature\Security;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Mechanic;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Service;
use App\Models\User;
use Tests\TestCase;

/**
 * Sweeps the Admin-only endpoint boundary documented in Security.md §B5.
 * Every route below must return 403 for an authenticated Cashier and NOT 403
 * for an Admin (200/201/422 etc. are all acceptable "not blocked" outcomes).
 */
class RbacMatrixTest extends TestCase
{
    public function test_admin_only_endpoints_reject_cashier_and_allow_admin(): void
    {
        $admin = $this->admin();
        $cashier = $this->cashier();

        $product = Product::factory()->create();
        $service = Service::factory()->create();
        $mechanic = Mechanic::factory()->create();
        $expense = Expense::factory()->create();
        $otherUser = User::factory()->cashier()->create();
        $paidSale = $this->paidSaleFixture();

        AuditLog::create([
            'action' => AuditLog::ACTION_LOGIN,
            'entity_type' => 'user',
            'created_at' => now(),
        ]);

        $matrix = [
            ['GET', '/api/v1/dashboard', []],
            ['GET', '/api/v1/reports/sales', []],
            ['GET', '/api/v1/reports/services', []],
            ['GET', '/api/v1/reports/inventory', []],
            ['POST', '/api/v1/reports/sales/export', ['format' => 'xlsx']],
            ['GET', '/api/v1/reports/finance', []],
            ['GET', '/api/v1/audit-logs', []],
            ['GET', '/api/v1/users', []],
            ['POST', '/api/v1/users', ['name' => 'X', 'username' => 'usr' . uniqid(), 'email' => uniqid() . '@bengkel.test', 'password' => 'password123', 'role' => 'CASHIER']],
            ['PUT', "/api/v1/users/{$otherUser->id}", ['name' => 'Y']],
            ['POST', '/api/v1/products', ['name' => 'P', 'unit' => 'pcs', 'purchase_price' => 1, 'sale_price' => 2]],
            ['PUT', "/api/v1/products/{$product->id}", ['name' => 'Diubah']],
            ['POST', "/api/v1/services", ['code' => 'C' . uniqid(), 'name' => 'S', 'sale_price' => 1]],
            ['PUT', "/api/v1/services/{$service->id}", ['name' => 'Diubah']],
            ['POST', '/api/v1/mechanics', ['name' => 'M']],
            ['PUT', "/api/v1/mechanics/{$mechanic->id}", ['name' => 'Diubah']],
            ['GET', '/api/v1/expenses', []],
            ['POST', '/api/v1/expenses', ['expense_date' => now()->toDateString(), 'category' => 'Op', 'amount' => 1000]],
            ['PUT', "/api/v1/expenses/{$expense->id}", ['amount' => 2000]],
        ];

        foreach ($matrix as [$method, $uri, $payload]) {
            $cashierResponse = $this->actingAs($cashier)->json($method, $uri, $payload ?? []);
            $this->assertSame(
                403,
                $cashierResponse->getStatusCode(),
                "Expected Cashier to be forbidden on {$method} {$uri}, got {$cashierResponse->getStatusCode()}"
            );

            $adminResponse = $this->actingAs($admin)->json($method, $uri, $payload ?? []);
            $this->assertNotSame(
                403,
                $adminResponse->getStatusCode(),
                "Expected Admin NOT to be forbidden on {$method} {$uri}, got {$adminResponse->getStatusCode()}"
            );
        }
    }

    public function test_shared_endpoints_allow_both_roles(): void
    {
        $admin = $this->admin();
        $cashier = $this->cashier();
        Customer::factory()->create();

        $shared = [
            ['GET', '/api/v1/sales'],
            ['GET', '/api/v1/products'],
            ['GET', '/api/v1/services'],
            ['GET', '/api/v1/mechanics'],
            ['GET', '/api/v1/customers'],
            ['GET', '/api/v1/service-orders'],
        ];

        foreach ($shared as [$method, $uri]) {
            $this->actingAs($cashier)->json($method, $uri)->assertStatus(200);
            $this->actingAs($admin)->json($method, $uri)->assertStatus(200);
        }
    }

    private function paidSaleFixture(): Sale
    {
        $cashier = $this->cashier();
        $product = Product::factory()->create(['current_stock' => 10]);

        $saleId = $this->actingAs($cashier)->postJson('/api/v1/sales', [
            'items' => [['item_type' => 'PRODUCT', 'product_id' => $product->id, 'quantity' => 1]],
        ])->json('data.id');

        $this->actingAs($cashier)->postJson("/api/v1/sales/{$saleId}/checkout", ['payment_method' => 'CASH']);

        return Sale::find($saleId);
    }
}
