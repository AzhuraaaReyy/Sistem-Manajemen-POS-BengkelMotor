<?php

namespace App\Services\WhatsApp;

use App\Services\WhatsApp\Contracts\MessagingGateway;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsAppService implements MessagingGateway
{
    public function sendMessage(string $phoneNumber, string $message): bool
    {
        if (config('whatsapp.simulation_mode')) {
            Log::info('WhatsApp [SIMULATION] Message sent', [
                'to' => $phoneNumber,
                'message' => $message,
                'timestamp' => now()->toIso8601String(),
            ]);
            return true;
        }

        $response = Http::withToken(config('whatsapp.meta.access_token'))
            ->post(
                config('whatsapp.meta.api_url') . '/' . config('whatsapp.meta.phone_number_id') . '/messages',
                [
                    'messaging_product' => 'whatsapp',
                    'to' => $phoneNumber,
                    'type' => 'text',
                    'text' => ['body' => $message],
                ]
            );

        if (!$response->successful()) {
            Log::error('WhatsApp API error', [
                'status' => $response->status(),
                'body' => $response->body(),
                'phone' => $phoneNumber,
            ]);
        }

        return $response->successful();
    }

    public function verifySignature(string $payload, string $signature): bool
    {
        if (config('whatsapp.simulation_mode')) {
            return true;
        }

        $expectedSignature = 'sha256=' . hash_hmac(
            'sha256',
            $payload,
            config('whatsapp.meta.app_secret')
        );

        return hash_equals($expectedSignature, $signature);
    }

    public function parseIncomingMessage(array $payload): ?array
    {
        $entry = $payload['entry'][0] ?? null;
        if (!$entry) {
            return null;
        }

        $change = $entry['changes'][0] ?? null;
        if (!$change) {
            return null;
        }

        $value = $change['value'] ?? null;
        $messages = $value['messages'] ?? [];

        if (empty($messages)) {
            return null;
        }

        $message = $messages[0];

        if (($message['type'] ?? null) !== 'text') {
            return null;
        }

        return [
            'from' => $message['from'] ?? '',
            'message' => $message['text']['body'] ?? '',
            'meta_message_id' => $message['id'] ?? '',
        ];
    }
}
