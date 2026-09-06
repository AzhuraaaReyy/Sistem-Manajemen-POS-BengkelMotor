<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\WhatsApp\SendWhatsAppMessage;
use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WhatsAppChatController extends Controller
{
    public function index(Request $request)
    {
        $query = WhatsAppChat::with(['latestMessage'])
            ->orderByDesc('last_message_at');

        if ($request->query('status') === 'bot_active') {
            $query->where('bot_active', true);
        } elseif ($request->query('status') === 'admin_takeover') {
            $query->where('admin_takeover', true);
        }

        return $query->paginate(15);
    }

    public function show(WhatsAppChat $chat)
    {
        $chat->load(['messages' => function ($q) {
            $q->orderBy('created_at', 'asc')->limit(100);
        }]);

        return $chat;
    }

    public function takeover(WhatsAppChat $chat): JsonResponse
    {
        $chat->update([
            'admin_takeover' => true,
            'bot_active' => false,
        ]);

        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'outbound',
            'sender_type' => 'admin',
            'event_type' => 'admin_takeover',
        ]);

        return response()->json(['message' => 'Chat taken over successfully']);
    }

    public function release(WhatsAppChat $chat): JsonResponse
    {
        $chat->update([
            'admin_takeover' => false,
            'bot_active' => false,
        ]);

        return response()->json(['message' => 'Chat released successfully']);
    }

    public function sendMessage(Request $request, WhatsAppChat $chat): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string|max:4096',
        ]);

        SendWhatsAppMessage::dispatch(
            $chat->phone_number,
            $validated['message'],
            $chat->id,
            'admin'
        );

        return response()->json(['message' => 'Message queued']);
    }
}
