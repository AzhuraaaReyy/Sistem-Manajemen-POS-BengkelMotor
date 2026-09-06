<?php

namespace Tests\Feature\WhatsApp;

use App\Jobs\WhatsApp\ActivateBotIfNoAdminReply;
use App\Models\WhatsAppChat;
use App\Services\WhatsApp\BotConversationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BotActivationJobTest extends TestCase
{
    use RefreshDatabase;

    public function test_activates_bot_after_delay_elapses(): void
    {
        config(['whatsapp.simulation_mode' => true]);

        $chat = WhatsAppChat::factory()->create([
            'last_message_at' => now()->subMinutes(6),
            'last_message_from' => 'customer',
            'admin_takeover' => false,
        ]);

        $bot = $this->mock(BotConversationService::class);
        $bot->shouldReceive('sendGreeting')
            ->once()
            ->with(\Mockery::on(fn ($c) => $c->id === $chat->id));

        (new ActivateBotIfNoAdminReply($chat->id))->handle($bot);

        $chat->refresh();
        $this->assertTrue($chat->bot_active);
    }
}
