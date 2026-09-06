<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\WhatsApp\ProcessIncomingWhatsAppMessage;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

class WhatsAppWebhookController extends Controller
{
    public function __construct(
        private WhatsAppService $whatsapp,
    ) {}

    public function verify(Request $request): Response
    {
        $mode = $request->query('hub_mode');
        $token = $request->query('hub_verify_token');
        $challenge = $request->query('hub_challenge');

        if ($mode === 'subscribe' && $token === config('whatsapp.meta.webhook_verify_token')) {
            return response($challenge, 200)->header('Content-Type', 'text/plain');
        }

        return response('Forbidden', 403);
    }

    public function handle(Request $request): JsonResponse
    {
        $payload = $request->all();
        $signature = $request->header('X-Hub-Signature-256', '');

        if (!config('whatsapp.simulation_mode')) {
            if (!$this->whatsapp->verifySignature(json_encode($payload), $signature)) {
                Log::warning('WhatsApp webhook: invalid signature', [
                    'ip' => $request->ip(),
                ]);
                return response()->json(['message' => 'Invalid signature'], 400);
            }
        }

        $message = $this->whatsapp->parseIncomingMessage($payload);

        if (!$message) {
            return response()->json(['message' => 'ok'], 200);
        }

        ProcessIncomingWhatsAppMessage::dispatch(
            $message['from'],
            $message['message'],
            $message['meta_message_id'] ?? null,
        );

        return response()->json(['message' => 'ok'], 200);
    }
}
