<?php

namespace App\Services\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use Illuminate\Support\Str;

class BotConversationService
{
    public function __construct(
        private GeminiAIService $gemini,
        private WhatsAppService $whatsapp,
        private BookingService $booking,
    ) {}

    public function handleMessage(WhatsAppChat $chat, string $message): void
    {
        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'inbound',
            'sender_type' => 'customer',
            'message_text' => $message,
        ]);

        $response = $this->gemini->processQuestion($message);

        if (Str::contains(strtolower($response), ['booking', 'reservasi', 'pesan servis'])) {
            $response .= "\n\nUntuk booking, saya butuh data berikut:\n";
            $response .= "1. Nama Anda\n2. TNKB (Plat Nomor)\n3. Tipe & Model Motor\n4. Keluhan/Jenis Servis\n5. Tanggal & Waktu yang diinginkan";
        }

        $this->whatsapp->sendMessage($chat->phone_number, $response);

        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'outbound',
            'sender_type' => 'bot',
            'message_text' => $response,
        ]);

        $chat->update([
            'last_message_at' => now(),
            'last_message_from' => 'bot',
        ]);
    }

    public function sendGreeting(WhatsAppChat $chat): void
    {
        $greeting = config('whatsapp.bot.greeting_message');
        
        $this->whatsapp->sendMessage($chat->phone_number, $greeting);

        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'outbound',
            'sender_type' => 'bot',
            'message_text' => $greeting,
            'event_type' => 'bot_greeting',
        ]);

        $chat->update([
            'last_message_at' => now(),
            'last_message_from' => 'bot',
        ]);
    }
}
