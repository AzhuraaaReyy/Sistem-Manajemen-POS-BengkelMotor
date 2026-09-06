<?php

namespace Tests\Feature\WhatsApp;

use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WebhookTest extends TestCase
{

    public function test_webhook_verification_succeeds_with_valid_token(): void
    {
        config(['whatsapp.meta.webhook_verify_token' => 'test_token']);

        $response = $this->get('/api/v1/whatsapp/webhook?' . http_build_query([
            'hub.mode' => 'subscribe',
            'hub.verify_token' => 'test_token',
            'hub.challenge' => 'challenge_string',
        ]));

        $response->assertStatus(200);
        $this->assertEquals('challenge_string', $response->getContent());
    }

    public function test_webhook_verification_fails_with_invalid_token(): void
    {
        config(['whatsapp.meta.webhook_verify_token' => 'test_token']);

        $response = $this->get('/api/v1/whatsapp/webhook?' . http_build_query([
            'hub.mode' => 'subscribe',
            'hub.verify_token' => 'wrong_token',
            'hub.challenge' => 'challenge_string',
        ]));

        $response->assertStatus(403);
    }

    public function test_webhook_rejects_invalid_signature_in_production_mode(): void
    {
        config([
            'whatsapp.simulation_mode' => false,
            'whatsapp.meta.app_secret' => 'test_secret',
        ]);

        $payload = ['entry' => []];
        
        $response = $this->postJson('/api/v1/whatsapp/webhook', $payload, [
            'X-Hub-Signature-256' => 'sha256=invalid_signature',
        ]);

        $response->assertStatus(400);
    }

    public function test_webhook_accepts_payload_in_simulation_mode(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        Queue::fake();

        $payload = [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'messages' => [
                                    [
                                        'from' => '628123456789',
                                        'id' => 'wamid.test123',
                                        'type' => 'text',
                                        'text' => ['body' => 'Halo'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/whatsapp/webhook', $payload);

        $response->assertStatus(200);
        Queue::assertPushed(\App\Jobs\WhatsApp\ProcessIncomingWhatsAppMessage::class);
    }

    public function test_webhook_ignores_non_text_messages(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        Queue::fake();

        $payload = [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'messages' => [
                                    [
                                        'from' => '628123456789',
                                        'type' => 'image',
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/whatsapp/webhook', $payload);

        $response->assertStatus(200);
        Queue::assertNothingPushed();
    }
}
