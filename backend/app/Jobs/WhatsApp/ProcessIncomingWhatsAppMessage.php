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

class ProcessIncomingWhatsAppMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        private string $phoneNumber,
        private string $message,
        private ?string $metaMessageId = null,
    ) {}

    public function handle(BotConversationService $bot): void
    {
        $chat = WhatsAppChat::firstOrCreate(
            ['phone_number' => $this->phoneNumber],
            [
                'last_message_at' => now(),
                'last_message_from' => 'customer',
                'bot_active' => false,
                'admin_takeover' => false,
            ]
        );

        $wasNewChat = $chat->wasRecentlyCreated;

        $chat->update([
            'last_message_at' => now(),
            'last_message_from' => 'customer',
        ]);

        $message = WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'inbound',
            'sender_type' => 'customer',
            'message_text' => $this->message,
            'meta_message_id' => $this->metaMessageId,
        ]);

        broadcast(new \App\Events\WhatsApp\NewWhatsAppMessage($message))->toOthers();

        if ($chat->admin_takeover) {
            return;
        }

        if ($chat->bot_active) {
            $bot->handleMessage($chat, $this->message);
            return;
        }

        ActivateBotIfNoAdminReply::dispatch($chat->id)
            ->delay(now()->addMinutes(config('whatsapp.bot.auto_activate_delay_minutes', 5)));
    }
}
