<?php

namespace App\Services\Sales;

use App\Models\AuditLog;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\Audit\AuditService;
use App\Services\Inventory\StockLedger;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class VoidSaleService
{
    public function __construct(
        private AuditService $audit,
        private StockLedger $ledger,
    ) {}

    /**Void of a sale. Allows CASHIER to void DRAFT/PENDING sales, ADMIN to void PAID sales.
     * Returns stock via REVERSAL movements and writes audit log.
     */
    public function void(Sale $sale, string $reason): Sale
    {
        $user = Auth::user();
        if (!$user instanceof User) {
            throw new RuntimeException('Unauthenticated.', 401);
        }
        if (trim($reason) === '') {
            throw new RuntimeException('Void reason is required.', 422);
        }

        // Kasir bisa void transaksi DRAFT atau PENDING
        // Admin bisa void transaksi DRAFT, PENDING, atau PAID
        if ($user->isCashier() && !in_array($sale->status, [Sale::STATUS_DRAFT, Sale::STATUS_PENDING], true)) {
            throw new RuntimeException('Kasir hanya bisa membatalkan transaksi DRAFT atau PENDING.', 403);
        }
        if ($user->isAdmin()) {
            // Admin bisa void semua status
        } else {
            // Kasir hanya bisa void DRAFT/PENDING
            if ($sale->status === Sale::STATUS_PAID) {
                throw new RuntimeException('Kasir tidak bisa membatalkan transaksi PAID. Hubungi admin.', 403);
            }
            if ($sale->status === Sale::STATUS_VOID) {
                throw new RuntimeException('Transaksi sudah dibatalkan.', 409);
            }
            if ($sale->status === Sale::STATUS_EXPIRED) {
                throw new RuntimeException('Transaksi sudah kedaluwarsa.', 409);
            }
        }

        return DB::transaction(function () use ($sale, $reason, $user) {
            // Lock the sale header row and re-verify status inside the lock so two
            // concurrent void requests for the same sale cannot both proceed
            // (prevents double VOID_RETURN stock movements).
            $sale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            
            if ($sale->status === Sale::STATUS_VOID) {
                throw new RuntimeException('Transaksi sudah dibatalkan.', 409);
            }
            if ($sale->status === Sale::STATUS_EXPIRED) {
                throw new RuntimeException('Transaksi sudah kedaluwarsa.', 409);
            }

            $allowedStatuses = [Sale::STATUS_DRAFT, Sale::STATUS_PENDING, Sale::STATUS_PAID];
            if (!in_array($sale->status, $allowedStatuses, true)) {
                throw new RuntimeException('Status transaksi tidak valid untuk dibatalkan.', 409);
            }

            $originalStatus = $sale->status;
            $sale->load(['items' => fn($q) => $q->where('item_type', SaleItem::TYPE_PRODUCT)]);

            $sale->status = Sale::STATUS_VOID;
            $sale->voided_at = now();
            $sale->voided_by = $user->id;
            $sale->void_reason = $reason;
            $sale->save();

            if ($originalStatus === Sale::STATUS_PAID) {
                $this->ledger->incrementForSale($sale, $sale->items, $user->id, StockMovement::TYPE_VOID_RETURN);
            }

            $this->audit->log(
                AuditLog::ACTION_SALE_VOIDED,
                'sale',
                $sale->id,
                null,
                [
                    'sale_code' => $sale->sale_code,
                    'grand_total' => $sale->grand_total,
                    'status' => $sale->status,
                ],
                $reason,
                $user->id
            );

            // Dispatch notification
            $notificationService = app(\App\Services\Notifications\NotificationService::class);
            $notificationService->create(
                $user,
                'TRANSACTION',
                'Transaksi Dibatalkan',
                "Transaksi {$sale->sale_code} dibatalkan",
                [
                    'sale_id' => $sale->id,
                    'sale_code' => $sale->sale_code,
                    'amount' => $sale->grand_total,
                    'reason' => $reason,
                ]
            );

            $sale->refresh();
            return $sale;
        }, 5);
    }
}
