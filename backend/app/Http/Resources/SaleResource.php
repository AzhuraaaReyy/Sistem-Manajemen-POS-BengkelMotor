<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    public function toArray($request)
    {
        return [
            'id' => $this->id,
            'sale_code' => $this->sale_code,
            'status' => $this->status,
            'subtotal' => $this->subtotal,
            'discount_amount' => $this->discount_amount,
            'grand_total' => $this->grand_total,
            'payment_method' => $this->payment_method,
            'paid_amount' => $this->paid_amount,
            'change_amount' => $this->change_amount,
            'paid_at' => $this->paid_at,
            'void_reason' => $this->void_reason,
            'voided_at' => $this->voided_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'payment_expires_at' => $this->whenLoaded('latestCharge', fn() => $this->latestCharge?->expires_at),
            'gateway_transaction_id' => $this->whenLoaded('latestCharge', fn() => $this->latestCharge?->gateway_transaction_id),
            'gateway_type' => $this->whenLoaded('latestCharge', fn() => $this->latestCharge?->gateway_type),
            'gateway_va_number' => $this->whenLoaded('latestCharge', fn() => $this->latestCharge?->va_number),
            'gateway_qr_url' => $this->whenLoaded('latestCharge', fn() => $this->latestCharge?->qr_url),
            'gateway_qr_string' => $this->whenLoaded('latestCharge', fn() => $this->latestCharge?->qr_string),
            'gateway_deeplink' => $this->whenLoaded('latestCharge', fn() => $this->latestCharge?->deeplink),
            'cashier' => $this->whenLoaded('cashier', fn() => $this->cashier ? [
                'id' => $this->cashier->id,
                'name' => $this->cashier->name,
            ] : null),
            'customer' => $this->whenLoaded('customer', fn() => $this->customer ? [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'phone' => $this->customer->phone,
            ] : null),
            'service_order' => $this->whenLoaded('serviceOrder', fn() => $this->serviceOrder ? [
                'id' => $this->serviceOrder->id,
                'order_code' => $this->serviceOrder->order_code,
                'status' => $this->serviceOrder->status,
                'complaint' => $this->serviceOrder->complaint,
                'motorcycle_type' => $this->serviceOrder->motorcycle_type,
            ] : null),
            'items' => SaleItemResource::collection($this->whenLoaded('items')),
        ];
    }
}
