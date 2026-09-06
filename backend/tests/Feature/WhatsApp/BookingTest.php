<?php

namespace Tests\Feature\WhatsApp;

use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_approve_booking(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'phone_number' => '628123456789',
            'customer_name' => 'John Doe',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario',
            'status' => 'PENDING',
        ]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/approve");

        $response->assertOk();

        $booking->refresh();
        $this->assertEquals('APPROVED', $booking->status);
        $this->assertEquals($admin->id, $booking->approved_by);
        $this->assertNotNull($booking->service_order_id);

        $serviceOrder = ServiceOrder::find($booking->service_order_id);
        $this->assertNotNull($serviceOrder);
        $this->assertEquals('OPEN', $serviceOrder->status);
    }

    public function test_admin_can_reject_booking(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create();
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'status' => 'PENDING',
        ]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/reject", [
            'reason' => 'Slot sudah penuh',
        ]);

        $response->assertOk();

        $booking->refresh();
        $this->assertEquals('REJECTED', $booking->status);
        $this->assertEquals('Slot sudah penuh', $booking->rejection_reason);
    }

    public function test_reject_requires_reason(): void
    {
        $admin = User::factory()->admin()->create();
        $booking = WhatsAppBooking::factory()->create(['status' => 'PENDING']);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/reject", [
            'reason' => '',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('reason');
    }

    public function test_cashier_cannot_approve_booking(): void
    {
        $cashier = User::factory()->cashier()->create();
        $booking = WhatsAppBooking::factory()->create(['status' => 'PENDING']);

        $response = $this->actingAs($cashier)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/approve");

        $response->assertStatus(403);
    }
}
