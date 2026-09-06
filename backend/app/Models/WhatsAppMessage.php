<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppMessage extends Model
{
    use HasFactory;

    protected $table = 'whatsapp_messages';

    protected $fillable = [
        'chat_id',
        'direction',
        'sender_type',
        'message_text',
        'event_type',
        'meta_message_id',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function chat(): BelongsTo
    {
        return $this->belongsTo(WhatsAppChat::class, 'chat_id');
    }
}
