<?php

namespace App\Jobs\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\BotConversationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

class ActivateBotIfNoAdminReply implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        private int $chatId,
    ) {}

    public function handle(BotConversationService $bot): void
    {
        $chat = WhatsAppChat::find($this->chatId);

        if (!$chat) {
            return;
        }

        if ($chat->admin_takeover) {
            return;
        }

        if ($chat->last_message_from === 'admin') {
            return;
        }

        if ($chat->last_message_at->diffInMinutes(now()) < 5) {
            return;
        }

        $chat->update(['bot_active' => true]);

        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'outbound',
            'sender_type' => 'bot',
            'event_type' => 'bot_activated',
            'message_text' => null,
        ]);

        $bot->sendGreeting($chat);
    }

    public function failed(Throwable $exception): void
    {
        Log::error('ActivateBotIfNoAdminReply failed', [
            'chat_id' => $this->chatId,
            'error' => $exception->getMessage(),
        ]);
    }
}
