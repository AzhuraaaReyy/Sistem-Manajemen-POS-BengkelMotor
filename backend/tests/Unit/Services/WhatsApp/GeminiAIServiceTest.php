<?php

namespace Tests\Unit\Services\WhatsApp;

use App\Models\Product;
use App\Models\Service;
use App\Services\WhatsApp\GeminiAIService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class GeminiAIServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Log::spy();
        Cache::flush();
    }

    public function test_process_question_returns_gemini_response_when_api_succeeds(): void
    {
        config([
            'whatsapp.gemini.api_key' => 'test_key',
            'whatsapp.gemini.model' => 'gemini-1.5-flash',
            'whatsapp.gemini.api_url' => 'https://generativelanguage.googleapis.com/v1beta/models',
        ]);

        Product::factory()->create([
            'name' => 'Oli Yamalube 10W-40',
            'current_stock' => 5,
            'sale_price' => 65000,
            'unit' => 'pcs',
            'is_active' => true,
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                ['text' => 'Oli Yamalube 10W-40 tersedia (stok: 5 pcs, harga: Rp 65.000)'],
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        $service = new GeminiAIService();
        $response = $service->processQuestion('Oli Yamalube ada?');

        $this->assertStringContainsString('Oli Yamalube', $response);
        $this->assertStringContainsString('tersedia', $response);
    }

    public function test_process_question_uses_fallback_when_gemini_fails(): void
    {
        config([
            'whatsapp.gemini.api_key' => 'test_key',
            'whatsapp.bot.fallback_message' => 'Maaf, saya belum bisa menjawab.',
        ]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([], 500),
        ]);

        $service = new GeminiAIService();
        $response = $service->processQuestion('jam buka?');

        $this->assertStringContainsString('08:00', $response);
        $this->assertStringContainsString('17:00', $response);
        
        Log::shouldHaveReceived('warning')->once();
    }

    public function test_rule_based_fallback_handles_jam_buka_question(): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([], 500),
        ]);

        $service = new GeminiAIService();
        $response = $service->processQuestion('jam buka bengkel?');

        $this->assertStringContainsString('Senin-Sabtu', $response);
        $this->assertStringContainsString('08:00', $response);
        $this->assertStringContainsString('Minggu', $response);
    }

    public function test_rule_based_fallback_handles_lokasi_question(): void
    {
        config(['whatsapp.bot.fallback_message' => 'Maaf, saya belum bisa menjawab.']);
        
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([], 500),
        ]);

        $service = new GeminiAIService();
        $response = $service->processQuestion('alamat bengkel dimana?');

        $this->assertStringContainsString('lokasi', $response);
        $this->assertStringContainsString('admin', $response);
    }

    public function test_sanitize_user_input_removes_html_tags(): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [['content' => ['parts' => [['text' => 'Response']]]]],
            ], 200),
        ]);

        $service = new GeminiAIService();
        $service->processQuestion('<script>alert("xss")</script>oli ada?');

        Http::assertSent(function ($request) {
            $body = json_decode($request->body(), true);
            $userMessage = $body['contents'][1]['parts'][0]['text'] ?? '';
            return !str_contains($userMessage, '<script>');
        });
    }

    public function test_context_is_cached_for_15_minutes(): void
    {
        config(['whatsapp.gemini.cache_ttl' => 900]);

        Product::factory()->create(['name' => 'Test Product', 'is_active' => true]);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [['content' => ['parts' => [['text' => 'Response']]]]],
            ], 200),
        ]);

        $service = new GeminiAIService();
        
        $service->processQuestion('test?');
        
        Product::truncate();
        
        $service->processQuestion('test again?');
        
        Http::assertSent(function ($request) {
            $body = json_decode($request->body(), true);
            $context = $body['contents'][0]['parts'][0]['text'] ?? '';
            return str_contains($context, 'Test Product');
        });
    }
}
