<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class WhatsAppChat extends Model
{
    use HasFactory;

    protected $table = 'whatsapp_chats';

    protected $fillable = [
        'phone_number',
        'last_message_at',
        'last_message_from',
        'bot_active',
        'admin_takeover',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'bot_active' => 'boolean',
        'admin_takeover' => 'boolean',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(WhatsAppMessage::class, 'chat_id');
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(WhatsAppMessage::class, 'chat_id')->latestOfMany();
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(WhatsAppBooking::class, 'chat_id');
    }
}
