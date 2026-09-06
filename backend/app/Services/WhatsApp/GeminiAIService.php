<?php

namespace App\Services\WhatsApp;

use App\Models\Product;
use App\Models\Service;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GeminiAIService
{
    public function processQuestion(string $question): string
    {
        try {
            $context = $this->buildContext();
            $sanitizedQuestion = $this->sanitizeUserInput($question);

            $response = Http::timeout(10)
                ->post(
                    config('whatsapp.gemini.api_url') . '/' . config('whatsapp.gemini.model') . ':generateContent?key=' . config('whatsapp.gemini.api_key'),
                    [
                        'contents' => [
                            ['parts' => [['text' => $context]]],
                            ['parts' => [['text' => $sanitizedQuestion]]],
                        ],
                    ]
                );

            if ($response->successful()) {
                $answer = $response->json('candidates.0.content.parts.0.text');
                return $this->sanitizeResponse($answer ?? config('whatsapp.bot.fallback_message'));
            }

            throw new \Exception('Gemini API returned non-200: ' . $response->status());

        } catch (\Exception $e) {
            Log::warning('Gemini AI failed, using fallback', [
                'error' => $e->getMessage(),
                'question' => $question,
            ]);

            return $this->ruleBasedFallback($question);
        }
    }

    private function buildContext(): string
    {
        return Cache::remember('whatsapp_bot_context', config('whatsapp.gemini.cache_ttl', 900), function () {
            $products = Product::where('is_active', true)
                ->select('name', 'current_stock', 'sale_price', 'unit')
                ->get();

            $services = Service::where('is_active', true)
                ->select('name', 'sale_price')
                ->get();

            $productList = $products->map(fn($p) =>
                "- {$p->name}: " .
                ($p->current_stock > 0 ? "Tersedia ({$p->current_stock} {$p->unit})" : "Habis") .
                ", Harga: Rp " . number_format($p->sale_price, 0, ',', '.')
            )->implode("\n");

            $serviceList = $services->map(fn($s) =>
                "- {$s->name}: Rp " . number_format($s->sale_price, 0, ',', '.')
            )->implode("\n");

            return "
Anda adalah asisten virtual bengkel motor. Jawab HANYA berdasarkan data berikut:

PRODUK TERSEDIA:
{$productList}

JASA SERVIS:
{$serviceList}

JAM OPERASIONAL:
Senin-Sabtu: 08:00 - 17:00 WIB
Minggu: LIBUR

ATURAN BOOKING:
- Minimal H-1 (tidak bisa hari yang sama)
- Maksimal 5 booking per hari
- Hanya jam 08:00-17:00

ATURAN PENTING:
- Jika data tidak tersedia, katakan: 'Maaf, informasi ini belum tersedia. Silakan hubungi admin kami.'
- JANGAN pernah memberikan informasi yang tidak ada di data di atas
- Jika pelanggan ingin booking, tanyakan: Nama, No. WhatsApp, TNKB, Tipe Motor, Keluhan, Tanggal & Waktu
";
        });
    }

    private function sanitizeUserInput(string $input): string
    {
        $input = strip_tags($input);

        $dangerousPatterns = [
            '/ignore previous instructions/i',
            '/system prompt/i',
            '/you are now/i',
            '/forget.*rules/i',
        ];

        foreach ($dangerousPatterns as $pattern) {
            $input = preg_replace($pattern, '[FILTERED]', $input);
        }

        return trim($input);
    }

    private function sanitizeResponse(string $response): string
    {
        $response = preg_replace('/API[_\s]?KEY[:\s]?\w+/i', '[REDACTED]', $response);
        $response = preg_replace('/TOKEN[:\s]?\w+/i', '[REDACTED]', $response);

        return trim($response);
    }

    private function ruleBasedFallback(string $question): string
    {
        if (preg_match('/\bjam\s+buka\b|\bbuka\s+jam\b/i', $question)) {
            return "Bengkel kami buka:\nSenin-Sabtu: 08:00 - 17:00 WIB\nMinggu: LIBUR";
        }

        if (preg_match('/\balamat\b|\blokasi\b/i', $question)) {
            return "Untuk informasi lokasi bengkel, silakan hubungi admin kami. Ketik 'hubungi admin' untuk bantuan lebih lanjut.";
        }

        return config('whatsapp.bot.fallback_message') .
            "\n\nKetik 'hubungi admin' untuk berbicara dengan tim kami.";
    }
}
