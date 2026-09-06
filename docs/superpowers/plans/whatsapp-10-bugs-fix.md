# Plan: Perbaikan 10 Bug WhatsApp Chatbot (BengkelMotor)

## Tujuan
Memperbaiki 9 bug (Task 1-9) pada fitur WhatsApp chatbot (keamanan, real-time Reverb/Echo, alur booking, resilience). Task 10 = dokumentasi/deferred (tanpa code change). Eksekusi TDD per task, tanpa commit (user yang commit/push).

## Lingkungan
- Repo: `D:\PORTOFOLIO\BengkelMotor`, remote `https://github.com/AzhuraaaReyy/BengkelMotor.git`
- Backend: Laravel (phpunit, SQLite in-memory di tes), Frontend: Vite/React/TS (`tsc --noEmit`, `vite build`; tanpa test runner)
- Auth: Sanctum cookie (`withCredentials`), BUKAN token di localStorage
- phpunit.xml: `BROADCAST_CONNECTION=null` → assertion broadcasting pakai source-level vs `.env.example`

## Task & Status

### Task 1 — Fix `simulation_mode` cast (SELESAI)
- `backend/config/whatsapp.php:85`: `filter_var(env('WHATSAPP_SIMULATION_MODE', false), FILTER_VALIDATE_BOOLEAN)`
- Test: `backend/tests/Unit/Config/WhatsAppConfigTest.php` (3 tes, 4 assertions)

### Task 2 — Verifikasi signature dari raw body (SELESAI)
- `WhatsAppWebhookController.php:38`: `verifySignature($request->getContent(), ...)` (bukan `json_encode($payload)`)
- Test di `WebhookTest.php` (`test_webhook_verifies_signature_against_raw_request_body`)
- Catatan: `withHeaders()` tidak berlaku untuk `call()` → header lewat array `$server`

### Task 3 — Reverb broadcast backend (SELESAI)
- `backend/.env`: `BROADCAST_CONNECTION=log` → `reverb`; `.env.example` baris duplikat `log` dihapus
- Test: `backend/tests/Unit/Config/BroadcastConfigTest.php` (2 tes, 4 assertions)

### Task 4 — Frontend Echo auth + proxy (SELESAI)
- `frontend/src/lib/websocketConfig.ts` (BARU): helper `buildEchoAuthHeaders(withCredentials)`
- `frontend/src/lib/websocket.ts`: hapus Bearer, tambah `withCredentials: true` + `buildEchoAuthHeaders(true)`
- `frontend/vite.config.ts`: proxy `/broadcasting` → `http://127.0.0.1:8000` (+ cookieDomainRewrite)

### Task 5 — GET booking + modal reachable + action_url (SELESAI)
- `WhatsAppBookingController@show`, route `GET whatsapp/bookings/{booking}` (role:ADMIN)
- Frontend: `getWhatsAppBookingApi`, `WhatsAppChatsPage` baca `?booking=` & clear query saat close, `NotificationItem/NotificationSection/NotificationBell` navigasi via `action_url`

### Task 6 — Wire `createBooking` ke alur bot (SELESAI)
- `BotConversationService.php` ditulis ulang: state machine `handleBookingFlow`, konstanta `BOOKING_FIELDS` (6 field), `promptNextField`, `finalizeBooking` (panggil `$this->booking->createBooking`, catch `ValidationException`)
- Test: `backend/tests/Feature/WhatsApp/BotConversationBookingTest.php` (3 tes, 9 assertions)

### Task 7 — Unique constraint + inbound idempotent (SELESAI)
- Migration `2026_09_06_000000_add_unique_meta_message_id_to_whatsapp_messages.php`
- `ProcessIncomingWhatsAppMessage::handle`: guard `WhatsAppMessage::where('meta_message_id', ...)->exists()` sebelum insert
- Test: `backend/tests/Feature/WhatsApp/IncomingMessageIdempotencyTest.php` (2 tes, 4 assertions)

### Task 8 — Tutup race `isSlotAvailable` (SELESAI)
- `BookingService::isSlotAvailable`: `DB::transaction` + `lockForUpdate()` saat count
- Test tambah di `BookingServiceTest.php` (slot full + slot available)

### Task 9 — Guard null `last_message_at` (SELESAI)
- `ActivateBotIfNoAdminReply.php:40`: tambah `if ($chat->last_message_at === null) { return; }`
- Catatan: schema `whatsapp_chats` NOT NULL → guard defensif; tes null dihapus (tak bisa dikonstruksi), tes positif `test_activates_bot_after_delay_elapses` dipertahankan (1 tes, 2 assertions)

### Task 10 — Dokumentasi/verifikasi (SELESAI)
- Backend: 245 tes, 783 assertions, 1 failure (pre-existing `test_create_booking_rejects_same_day` — hari ini Minggu, check libur Minggu duluan; independen dari perubahan)
- Frontend: `npm run typecheck` exit 0, `npm run build` exit 0

## Verifikasi Akhir
- `cd backend && php vendor/bin/phpunit` → OK kecuali 1 tes date-dependent (Minggu)
- `cd frontend && npm run typecheck && npm run build` → exit 0

## Catatan
- Tanpa commit (sesuai instruksi user). Perubahan pre-existing `lucide-react` di `frontend/package.json` dibiarkan untuk digabung user saat commit.
- `frontend/dist/` ter-track → artifact build muncul di `git status`.
- `.env` gitignored (perubahan reverb ada di `.env` dan `.env.example`).
