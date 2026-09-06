<?php

namespace Tests\Feature\WhatsApp;

use App\Models\User;
use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ChatManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_chats(): void
    {
        $admin = User::factory()->admin()->create();
        WhatsAppChat::factory()->count(3)->create();

        $response = $this->actingAs($admin)->getJson('/api/v1/whatsapp/chats');

        $response->assertOk();
        $response->assertJsonCount(3, 'data');
    }

    public function test_cashier_cannot_access_chats(): void
    {
        $cashier = User::factory()->cashier()->create();

        $response = $this->actingAs($cashier)->getJson('/api/v1/whatsapp/chats');

        $response->assertStatus(403);
    }

    public function test_admin_can_view_chat_detail_with_messages(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create();
        WhatsAppMessage::factory()->count(5)->create(['chat_id' => $chat->id]);

        $response = $this->actingAs($admin)->getJson("/api/v1/whatsapp/chats/{$chat->id}");

        $response->assertOk();
        $response->assertJsonCount(5, 'messages');
    }

    public function test_admin_can_takeover_bot_chat(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['bot_active' => true]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/takeover");

        $response->assertOk();

        $chat->refresh();
        $this->assertTrue($chat->admin_takeover);
        $this->assertFalse($chat->bot_active);

        $this->assertDatabaseHas('whatsapp_messages', [
            'chat_id' => $chat->id,
            'event_type' => 'admin_takeover',
        ]);
    }

    public function test_admin_can_release_chat(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['admin_takeover' => true]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/release");

        $response->assertOk();

        $chat->refresh();
        $this->assertFalse($chat->admin_takeover);
        $this->assertFalse($chat->bot_active);
    }

public function test_admin_can_send_message(): void
        {
            $admin = User::factory()->admin()->create();
            $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
            Queue::fake();

            $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/send", [
                'message' => 'Hello from admin',
            ]);

            $response->assertOk();
            Queue::assertPushed(\App\Jobs\WhatsApp\SendWhatsAppMessage::class, function ($job) use ($chat) {
                return $job->chatId() === $chat->id && $job->senderType() === 'admin';
            });
        }

    public function test_send_message_validates_message_field(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create();

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/send", [
            'message' => '', // Empty
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('message');
    }

    public function test_chats_can_be_filtered_by_status(): void
    {
        $admin = User::factory()->admin()->create();
        WhatsAppChat::factory()->create(['bot_active' => true]);
        WhatsAppChat::factory()->create(['admin_takeover' => true]);
        WhatsAppChat::factory()->create(['bot_active' => false, 'admin_takeover' => false]);

        $response = $this->actingAs($admin)->getJson('/api/v1/whatsapp/chats?status=bot_active');
        $response->assertOk();
        $response->assertJsonCount(1, 'data');

        $response = $this->actingAs($admin)->getJson('/api/v1/whatsapp/chats?status=admin_takeover');
        $response->assertOk();
        $response->assertJsonCount(1, 'data');
    }
}
