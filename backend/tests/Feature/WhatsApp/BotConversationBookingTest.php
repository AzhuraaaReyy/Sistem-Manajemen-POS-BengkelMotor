<?php

namespace Tests\Feature\WhatsApp;

use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use App\Services\WhatsApp\BookingService;
use App\Services\WhatsApp\BotConversationService;
use App\Services\WhatsApp\GeminiAIService;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BotConversationBookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_flow_collects_fields_and_creates_booking(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        User::factory()->admin()->create();

        $chat = WhatsAppChat::factory()->create([
            'phone_number' => '628123456789',
            'bot_active' => true,
        ]);

        $service = app(BotConversationService::class);

        $date = today()->addDays(2)->toDateString();

        $service->handleMessage($chat, 'saya mau booking');
        $service->handleMessage($chat, 'Budi Santoso');
        $service->handleMessage($chat, 'B 1234 ABC');
        $service->handleMessage($chat, 'Honda Vario 160');
        $service->handleMessage($chat, 'Ganti oli');
        $service->handleMessage($chat, $date);
        $service->handleMessage($chat, '10:00');

        $booking = WhatsAppBooking::where('chat_id', $chat->id)->first();

        $this->assertNotNull($booking);
        $this->assertEquals('PENDING', $booking->status);
        $this->assertEquals('Budi Santoso', $booking->customer_name);
        $this->assertEquals('B1234ABC', $booking->tnkb);
        $this->assertEquals('Honda Vario 160', $booking->motorcycle_type);
        $this->assertEquals('Ganti oli', $booking->complaint);
    }

    public function test_booking_flow_can_be_cancelled(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        User::factory()->admin()->create();

        $chat = WhatsAppChat::factory()->create([
            'phone_number' => '628123456789',
            'bot_active' => true,
        ]);

        $service = app(BotConversationService::class);

        $service->handleMessage($chat, 'saya mau booking');
        $service->handleMessage($chat, 'Budi');
        $service->handleMessage($chat, 'batal');

        $this->assertDatabaseCount('whatsapp_bookings', 0);
    }

    public function test_booking_flow_persists_draft_across_service_instances(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        User::factory()->admin()->create();

        $chat = WhatsAppChat::factory()->create([
            'phone_number' => '628123456789',
            'bot_active' => true,
        ]);

        $date = today()->addDays(2)->toDateString();

        // Simulasi produksi: TIAN webhook pesan memberi instance service BARU
        // (sama seperti job antrian yang resolve service fresh tiap kali).
        // Draft harus tersimpan di DB, bukan di memori instance.
        $messages = [
            'saya mau booking',
            'Budi Santoso',
            'B 1234 ABC',
            'Honda Vario 160',
            'Ganti oli',
            $date,
            '10:00',
        ];

        foreach ($messages as $msg) {
            $service = app(BotConversationService::class);
            $service->handleMessage($chat, $msg);
        }

        $booking = WhatsAppBooking::where('chat_id', $chat->id)->first();

        $this->assertNotNull($booking);
        $this->assertEquals('Budi Santoso', $booking->customer_name);
        $this->assertEquals('B1234ABC', $booking->tnkb);
    }

    public function test_handle_message_creates_only_outbound_not_duplicate_inbound(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        User::factory()->admin()->create();

        $gemini = $this->mock(GeminiAIService::class);
        $gemini->shouldReceive('processQuestion')->once()->andReturn('Terima kasih!');

        $chat = WhatsAppChat::factory()->create([
            'phone_number' => '628123456789',
            'bot_active' => true,
        ]);

        $service = new BotConversationService(
            $gemini,
            app(WhatsAppService::class),
            app(BookingService::class),
        );

        // Pesan inbound sudah disimpan oleh ProcessIncomingWhatsAppMessage;
        // handleMessage tidak boleh menyimpan ulang (duplikat).
        $service->handleMessage($chat, 'berapa harga oli?');

        $this->assertDatabaseCount('whatsapp_messages', 1);
        $this->assertDatabaseMissing('whatsapp_messages', [
            'chat_id' => $chat->id,
            'direction' => 'inbound',
        ]);
    }

    public function test_booking_draft_is_cleared_after_completion(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        User::factory()->admin()->create();

        $chat = WhatsAppChat::factory()->create([
            'phone_number' => '628123456789',
            'bot_active' => true,
        ]);

        $date = today()->addDays(2)->toDateString();

        $messages = [
            'saya mau booking',
            'Budi Santoso',
            'B 1234 ABC',
            'Honda Vario 160',
            'Ganti oli',
            $date,
            '10:00',
        ];

        foreach ($messages as $msg) {
            $service = app(BotConversationService::class);
            $service->handleMessage($chat, $msg);
        }

        $chat->refresh();
        $this->assertNull($chat->booking_draft);
        $this->assertDatabaseCount('whatsapp_bookings', 1);

        // Pesan 'booking' berikutnya harus memulai alur BARU, bukan
        // men-finalisasi ulang draft lama (yang membuat booking duplikat).
        $service = app(BotConversationService::class);
        $service->handleMessage($chat, 'saya mau booking');

        $this->assertDatabaseCount('whatsapp_bookings', 1);
        $chat->refresh();
        $this->assertNotNull($chat->booking_draft);
    }

    public function test_normal_message_is_not_treated_as_booking(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        User::factory()->admin()->create();

        $gemini = $this->mock(GeminiAIService::class);
        $gemini->shouldReceive('processQuestion')->once()->andReturn('Harga oli mulai Rp 30.000.');

        $chat = WhatsAppChat::factory()->create([
            'phone_number' => '628123456789',
            'bot_active' => true,
        ]);

        $service = new BotConversationService(
            $gemini,
            app(WhatsAppService::class),
            app(BookingService::class),
        );

        // Pesan biasa tanpa indikasi booking -> tidak masuk alur booking,
        // sehingga tidak ada draft & tidak membuat booking.
        $service->handleMessage($chat, 'berapa harga oli?');

        $this->assertDatabaseCount('whatsapp_bookings', 0);
    }
}
