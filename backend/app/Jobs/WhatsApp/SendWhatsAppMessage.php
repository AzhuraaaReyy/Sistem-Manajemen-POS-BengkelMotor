<?php

namespace App\Jobs\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendWhatsAppMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        protected string $phoneNumber,
        protected string $message,
        protected int $chatId,
        protected string $senderType = 'admin',
    ) {}

    public function chatId(): int
    {
        return $this->chatId;
    }

    public function senderType(): string
    {
        return $this->senderType;
    }

    public function phoneNumber(): string
    {
        return $this->phoneNumber;
    }

    public function message(): string
    {
        return $this->message;
    }

    public function handle(WhatsAppService $whatsapp): void
    {
        $success = $whatsapp->sendMessage($this->phoneNumber, $this->message);

        if ($success) {
            WhatsAppMessage::create([
                'chat_id' => $this->chatId,
                'direction' => 'outbound',
                'sender_type' => $this->senderType,
                'message_text' => $this->message,
            ]);

            WhatsAppChat::find($this->chatId)?->update([
                'last_message_at' => now(),
                'last_message_from' => $this->senderType,
            ]);
        } else {
            Log::error('Failed to send WhatsApp message', [
                'phone' => $this->phoneNumber,
                'chat_id' => $this->chatId,
            ]);
        }
    }
}
