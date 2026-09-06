<?php

namespace App\Events\WhatsApp;

use App\Models\WhatsAppMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewWhatsAppMessage implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public WhatsAppMessage $message,
    ) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('whatsapp-chats');
    }

    public function broadcastWith(): array
    {
        return [
            'chat_id' => $this->message->chat_id,
            'message' => [
                'id' => $this->message->id,
                'direction' => $this->message->direction,
                'sender_type' => $this->message->sender_type,
                'message_text' => $this->message->message_text,
                'created_at' => $this->message->created_at->toIso8601String(),
            ],
        ];
    }
}
