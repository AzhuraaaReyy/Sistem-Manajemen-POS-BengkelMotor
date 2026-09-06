<?php

namespace Tests\Unit\Services\WhatsApp;

use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class WhatsAppServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Log::spy();
    }

    public function test_send_message_logs_in_simulation_mode(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        
        $service = new WhatsAppService();
        $result = $service->sendMessage('628123456789', 'Test message');
        
        $this->assertTrue($result);
        Log::shouldHaveReceived('info')
            ->once()
            ->with('WhatsApp [SIMULATION] Message sent', \Mockery::on(function ($arg) {
                return isset($arg['to']) 
                    && $arg['to'] === '628123456789'
                    && isset($arg['message'])
                    && $arg['message'] === 'Test message';
            }));
    }

    public function test_send_message_calls_meta_api_in_production_mode(): void
    {
        config([
            'whatsapp.simulation_mode' => false,
            'whatsapp.meta.access_token' => 'test_token',
            'whatsapp.meta.phone_number_id' => '123456789',
            'whatsapp.meta.api_url' => 'https://graph.facebook.com/v18.0',
        ]);

        Http::fake([
            'graph.facebook.com/*' => Http::response(['success' => true], 200),
        ]);

        $service = new WhatsAppService();
        $result = $service->sendMessage('628123456789', 'Test message');

        $this->assertTrue($result);
        Http::assertSent(function ($request) {
            return $request->url() === 'https://graph.facebook.com/v18.0/123456789/messages'
                && $request['messaging_product'] === 'whatsapp'
                && $request['to'] === '628123456789'
                && $request['text']['body'] === 'Test message';
        });
    }

    public function test_verify_signature_returns_true_in_simulation_mode(): void
    {
        config(['whatsapp.simulation_mode' => true]);
        
        $service = new WhatsAppService();
        $result = $service->verifySignature('any payload', 'any signature');
        
        $this->assertTrue($result);
    }

    public function test_verify_signature_validates_hmac_in_production_mode(): void
    {
        config([
            'whatsapp.simulation_mode' => false,
            'whatsapp.meta.app_secret' => 'test_secret',
        ]);

        $payload = '{"test": "data"}';
        $validSignature = 'sha256=' . hash_hmac('sha256', $payload, 'test_secret');
        $invalidSignature = 'sha256=invalid_hash';

        $service = new WhatsAppService();
        
        $this->assertTrue($service->verifySignature($payload, $validSignature));
        $this->assertFalse($service->verifySignature($payload, $invalidSignature));
    }

    public function test_parse_incoming_message_extracts_text_message(): void
    {
        $payload = [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'messages' => [
                                    [
                                        'from' => '628123456789',
                                        'id' => 'wamid.ABC123',
                                        'type' => 'text',
                                        'text' => ['body' => 'Halo, oli ada?'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];

        $service = new WhatsAppService();
        $result = $service->parseIncomingMessage($payload);

        $this->assertIsArray($result);
        $this->assertEquals('628123456789', $result['from']);
        $this->assertEquals('Halo, oli ada?', $result['message']);
        $this->assertEquals('wamid.ABC123', $result['meta_message_id']);
    }

    public function test_parse_incoming_message_returns_null_for_non_text(): void
    {
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

        $service = new WhatsAppService();
        $result = $service->parseIncomingMessage($payload);

        $this->assertNull($result);
    }
}
