<?php

namespace Tests\Unit\Services\WhatsApp;

use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use App\Services\Notifications\NotificationService;
use App\Services\WhatsApp\BookingService;
use App\Services\WhatsApp\WhatsAppService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class BookingServiceTest extends TestCase
{
    use RefreshDatabase;

    private BookingService $service;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->service = new BookingService(
            $this->mock(NotificationService::class),
            $this->mock(WhatsAppService::class),
        );
    }

    public function test_create_booking_rejects_sunday(): void
    {
        $chat = WhatsAppChat::factory()->create();
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('libur di hari Minggu');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => Carbon::parse('2026-09-06')->toDateString(), // Sunday
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_rejects_same_day(): void
    {
        $chat = WhatsAppChat::factory()->create();
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('minimal H-1');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => today()->toDateString(),
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_rejects_outside_operational_hours(): void
    {
        $chat = WhatsAppChat::factory()->create();
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('08:00 - 17:00');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => today()->addDays(2)->toDateString(),
            'booking_time' => '19:00', // After close
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_rejects_when_slots_full(): void
    {
        $date = today()->addDays(2);
        $chat = WhatsAppChat::factory()->create();
        
        // Create 5 existing bookings (max)
        WhatsAppBooking::factory()->count(5)->create([
            'booking_date' => $date,
            'status' => 'PENDING',
        ]);
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('slot.*penuh');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => $date->toDateString(),
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_succeeds_with_valid_data(): void
    {
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $admin = User::factory()->admin()->create();

        $notificationService = $this->mock(NotificationService::class);
        $notificationService->shouldReceive('create')->once();

        $service = new BookingService($notificationService, $this->mock(WhatsAppService::class));

        $booking = $service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => today()->addDays(2)->toDateString(),
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);

        $this->assertInstanceOf(WhatsAppBooking::class, $booking);
        $this->assertEquals('PENDING', $booking->status);
        $this->assertEquals('John Doe', $booking->customer_name);
        $this->assertEquals('628123456789', $booking->phone_number);
    }

    public function test_approve_creates_service_order_and_sends_notification(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'customer_name' => 'John Doe',
            'phone_number' => '628123456789',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'status' => 'PENDING',
        ]);

        $whatsappService = $this->mock(WhatsAppService::class);
        $whatsappService->shouldReceive('sendMessage')
            ->once()
            ->with('628123456789', \Mockery::on(function ($msg) {
                return str_contains($msg, 'Booking Anda Disetujui');
            }))
            ->andReturn(true);

        $service = new BookingService(
            $this->mock(NotificationService::class),
            $whatsappService
        );

        $service->approve($booking, $admin);

        $booking->refresh();
        $this->assertEquals('APPROVED', $booking->status);
        $this->assertEquals($admin->id, $booking->approved_by);
        $this->assertNotNull($booking->approved_at);
        $this->assertNotNull($booking->service_order_id);

        $serviceOrder = ServiceOrder::find($booking->service_order_id);
        $this->assertNotNull($serviceOrder);
        $this->assertEquals('Honda Vario 160', $serviceOrder->motorcycle_type);
        $this->assertEquals('OPEN', $serviceOrder->status);
    }

    public function test_approve_creates_customer_if_not_exists(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'phone_number' => '628123456789',
            'customer_name' => 'New Customer',
            'status' => 'PENDING',
        ]);

        $service = new BookingService(
            $this->mock(NotificationService::class),
            $this->mock(WhatsAppService::class)
        );

        $service->approve($booking, $admin);

        $customer = Customer::where('phone', '628123456789')->first();
        $this->assertNotNull($customer);
        $this->assertEquals('New Customer', $customer->name);
    }

    public function test_reject_updates_status_and_sends_notification(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'phone_number' => '628123456789',
            'status' => 'PENDING',
        ]);

        $whatsappService = $this->mock(WhatsAppService::class);
        $whatsappService->shouldReceive('sendMessage')
            ->once()
            ->with('628123456789', \Mockery::on(function ($msg) {
                return str_contains($msg, 'Booking Anda Ditolak');
            }))
            ->andReturn(true);

        $service = new BookingService(
            $this->mock(NotificationService::class),
            $whatsappService
        );

        $service->reject($booking, $admin, 'Slot penuh');

        $booking->refresh();
        $this->assertEquals('REJECTED', $booking->status);
        $this->assertEquals('Slot penuh', $booking->rejection_reason);
    }
}
