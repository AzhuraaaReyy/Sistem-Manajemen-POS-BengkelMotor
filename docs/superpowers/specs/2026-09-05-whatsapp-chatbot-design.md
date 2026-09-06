# WhatsApp Chatbot Auto-Fallback Design Specification

**Date:** 2026-09-05  
**Status:** Approved  
**Implementation Plan:** `docs/superpowers/plans/2026-09-05-whatsapp-chatbot-auto-fallback.md`

## Overview

WhatsApp Chatbot integration untuk bengkel motor dengan auto-fallback 5 menit jika admin tidak balas. Bot menggunakan Google Gemini AI untuk menjawab pertanyaan secara dinamis berdasarkan data real-time (produk, servis, jam buka). Admin dapat mengambil alih chat kapan saja. Booking yang diapprove otomatis membuat service order.

## Architecture

```
Pelanggan (WA App) → Meta Cloud API (webhook) → Laravel Backend
  ↓
  Queue Job (timer 5 menit)
  ↓
  Gemini AI (process + context database)
  ↓
  WhatsApp Service → Meta API → Pelanggan
  
Admin Dashboard:
  Laravel Reverb (WebSocket) → Real-time notification → React UI
```

## Database Schema

### whatsapp_chats
- **Purpose:** Track conversation state per phone number (guest-based)
- **Key fields:** phone_number (unique), last_message_at, last_message_from, bot_active, admin_takeover
- **Retention:** 60 days

### whatsapp_messages
- **Purpose:** Log all incoming/outgoing messages
- **Key fields:** chat_id (FK), direction, sender_type, message_text, event_type
- **Cascades:** ON DELETE CASCADE with chat

### whatsapp_bookings
- **Purpose:** Store booking requests from bot (separate from service_orders until approved)
- **Key fields:** chat_id (FK), customer_name, phone_number, booking_date, booking_time, tnkb, motorcycle_type, complaint, status, service_order_id (nullable FK)
- **Retention:** 365 days
- **Validation:** H-1 minimum, Mon-Sat only, 08:00-17:00, max 5 slots/day

## Service Layer

### WhatsAppService
- Send messages to Meta API
- Verify webhook signature (HMAC SHA-256)
- Parse incoming messages
- **Simulation mode:** Log to file instead of real API call

### GeminiAIService
- Process questions with Gemini AI 1.5 Flash
- Build context from database (products, services, operational hours)
- Cache context 15 minutes
- **Fallback:** Rule-based keyword matching when Gemini fails

### BotConversationService
- Orchestrate conversation flow
- Detect booking intent
- Send greeting when bot activates

### BookingService
- Validate booking data (date, time, slots)
- Create booking record
- Notify admins
- **Auto-create service order** when APPROVED (with customer auto-creation)

## Queue Jobs

### ActivateBotIfNoAdminReply
- Delayed 5 minutes from last customer message
- **Timer reset:** Each new customer message cancels old job and dispatches new one
- Conditions: Check admin_takeover flag, last_message_from status
- Action: Set bot_active = true, send greeting

### ProcessIncomingWhatsAppMessage
- Parse incoming webhook payload
- Create/update chat record
- Route to bot (if active) or queue timer (if new/waiting)

### SendWhatsAppMessage
- Async message sending (decoupling)
- Log outgoing message
- Update chat timestamp

## Security

### Webhook
- **Signature verification:** HMAC SHA-256 with app_secret (bypass in simulation mode)
- **Rate limiting:** 60 webhooks/min per IP
- **CSRF exempt:** `/api/v1/whatsapp/webhook`

### Input Validation
- Strip HTML tags from all user input
- Sanitize TNKB (uppercase, alphanumeric only)
- Prevent prompt injection (filter dangerous patterns)

### Multi-Layer Fallback
1. Gemini AI (primary)
2. Rule-based keyword matching (jam buka, lokasi)
3. Generic fallback message + trigger admin takeover

## Frontend UI

### WhatsApp Chats Page (`/whatsapp-chats`)
- **Layout:** 2-column (chat list + detail window)
- **Features:**
  - Filter by status (bot_active, admin_takeover)
  - Real-time message updates via WebSocket
  - Admin takeover/release controls
  - Manual message sending
  - Booking approval modal

### WebSocket Integration
- **Channel:** `whatsapp-chats` (public)
- **Events:** `NewWhatsAppMessage`, `NewWhatsAppBooking`
- **Tech:** Laravel Reverb (native Laravel broadcasting)

## Configuration

### Environment Variables
```env
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
WHATSAPP_SIMULATION_MODE=true
BROADCAST_CONNECTION=reverb
```

### Operational Settings (Hardcoded)
- Hours: 08:00-17:00, Mon-Sat
- Days off: Sunday
- Max bookings/day: 5
- Booking advance: 24 hours (H-1)
- Bot activation delay: 5 minutes

## Testing Strategy

### Unit Tests
- GeminiAIService: Fallback mechanism, context caching, sanitization
- BookingService: Validation rules (Sunday, H-1, slots, hours)
- WhatsAppService: Simulation mode, signature verification

### Feature Tests
- Webhook: Signature validation, payload parsing
- Chat Management: Takeover, release, send message (RBAC)
- Booking: Approve (auto-create service order + customer), reject

## Data Retention & Cleanup

- **Chat history:** 60 days (except chats with active bookings)
- **Bookings:** 365 days (REJECTED or APPROVED > 30 days old)
- **Command:** `php artisan whatsapp:cleanup` (scheduled daily)

## Deployment Checklist

1. Install Laravel Reverb: `composer require laravel/reverb`
2. Run migrations: `php artisan migrate`
3. Setup Meta WhatsApp Business Account
4. Setup Google Gemini AI API key
5. Configure webhook URL in Meta dashboard
6. Start queue worker: `php artisan queue:work`
7. Start Reverb server: `php artisan reverb:start`
8. Test in simulation mode first
9. Switch to production mode: `WHATSAPP_SIMULATION_MODE=false`

## Limitations & Future Enhancements

### Current Limitations
- Bot hanya handle text messages (no media)
- Booking tidak bisa diubah setelah dibuat (hanya approve/reject)
- No conversation state tracking (stateless per message)

### Future Enhancements (Out of Scope)
- Media handling (image, voice note)
- Conversation memory (multi-turn booking flow)
- Broadcast messages
- Template messages
- Analytics dashboard
