<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppBooking extends Model
{
    use HasFactory;

    protected $table = 'whatsapp_bookings';

    protected $fillable = [
        'chat_id',
        'customer_name',
        'phone_number',
        'booking_date',
        'booking_time',
        'tnkb',
        'motorcycle_type',
        'complaint',
        'status',
        'approved_by',
        'approved_at',
        'rejection_reason',
        'service_order_id',
    ];

    protected $casts = [
        'booking_date' => 'date',
        'approved_at' => 'datetime',
    ];

    public function chat(): BelongsTo
    {
        return $this->belongsTo(WhatsAppChat::class, 'chat_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }
}
