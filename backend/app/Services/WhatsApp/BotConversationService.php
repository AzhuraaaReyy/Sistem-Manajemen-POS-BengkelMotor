<?php

namespace App\Services\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BotConversationService
{
    /**
     * Urutan field yang dikumpulkan untuk booking. Kunci mencocokkan payload
     * yang dibutuhkan BookingService::createBooking / sanitizeBookingData.
     */
    private const BOOKING_FIELDS = [
        'customer_name' => 'Nama Anda',
        'tnkb' => 'TNKB (No. Plat)',
        'motorcycle_type' => 'Tipe & Model Motor',
        'complaint' => 'Keluhan / Jenis servis',
        'booking_date' => 'Tanggal booking (format YYYY-MM-DD, minimal H-1, minggu libur)',
        'booking_time' => 'Jam booking (format HH:MM, antara 08:00-17:00)',
    ];

    public function __construct(
        private GeminiAIService $gemini,
        private WhatsAppService $whatsapp,
        private BookingService $booking,
    ) {}

    public function handleMessage(WhatsAppChat $chat, string $message): void
    {
        $response = $this->handleBookingFlow($chat, $message);

        if ($response === null) {
            $response = $this->gemini->processQuestion($message);

            if (Str::contains(strtolower($response), ['booking', 'reservasi', 'pesan servis'])) {
                $response .= "\n\nUntuk booking, saya butuh data berikut:\n";
                $response .= "1. Nama Anda\n2. TNKB (Plat Nomor)\n3. Tipe & Model Motor\n4. Keluhan/Jenis Servis\n5. Tanggal & Waktu yang diinginkan\n\nKetik 'booking' untuk mulai.";
            }
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

    /**
     * Deterministic booking-collection state machine.
     *
     * Draft disimpan di kolom whatsapp_chats.booking_draft agar bertahan
     * lintas job antrian (tiap webhook = instance service baru).
     *
     * Mengembalikan teks balasan jika pesan dikonsumsi oleh alur booking
     * (mulai / lanjut / selesai / batal), atau null jika bukan pesan booking
     * sehingga pemanggil melanjutkan ke jalur Gemini.
     */
    private function handleBookingFlow(WhatsAppChat $chat, string $text): ?string
    {
        $draft = $chat->booking_draft;

        if (preg_match('/\b(batal|cancel)\b/i', $text) && $draft !== null) {
            $chat->update(['booking_draft' => null]);
            return "Baik, proses booking dibatalkan. Ada lagi yang bisa saya bantu?";
        }

        if ($draft === null) {
            if (!preg_match('/\b(booking|reservasi|janji|mau\s+servis|mau\s+service)\b/i', $text)) {
                return null;
            }

            $chat->update(['booking_draft' => []]);

            return $this->promptNextField(0);
        }

        $index = count($draft);
        $field = array_keys(self::BOOKING_FIELDS)[$index] ?? null;

        if ($field === null) {
            $chat->update(['booking_draft' => null]);
            return $this->finalizeBooking($chat, $draft);
        }

        $draft[$field] = trim($text);
        $chat->update(['booking_draft' => $draft]);

        $nextIndex = $index + 1;

        if ($nextIndex >= count(self::BOOKING_FIELDS)) {
            return $this->finalizeBooking($chat, $draft);
        }

        return $this->promptNextField($nextIndex);
    }

    private function promptNextField(int $index): string
    {
        $labels = array_values(self::BOOKING_FIELDS);

        $intro = $index === 0
            ? "Siap! Kita buat booking. Mohon jawab berurutan.\n\n"
            : "Terima kasih. Selanjutnya:\n\n";

        $list = implode("\n", array_map(
            fn ($i) => ($i === $index ? '>> ' : '   ') . ($i + 1) . '. ' . $labels[$i],
            range(0, count($labels) - 1)
        ));

        return $intro . $list . "\n\nSilakan ketik: " . $labels[$index] . "\n\nKetik 'batal' untuk membatalkan.";
    }

    private function finalizeBooking(WhatsAppChat $chat, array $draft): string
    {
        $chat->update(['booking_draft' => null]);

        try {
            $this->booking->createBooking($chat, $draft);

            return "Booking Anda berhasil dibuat!\n\n" .
                "Tanggal: {$draft['booking_date']}\nJam: {$draft['booking_time']}\nMotor: {$draft['motorcycle_type']} ({$draft['tnkb']})\n\n" .
                "Terima kasih! Admin akan menghubungi Anda untuk konfirmasi.";
        } catch (ValidationException $e) {
            $message = collect($e->errors())->flatten()->first()
                ?? 'Maaf, data booking tidak valid. Silakan coba lagi.';

            return $message;
        }
    }
}