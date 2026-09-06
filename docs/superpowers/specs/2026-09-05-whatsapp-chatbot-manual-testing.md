# WhatsApp Chatbot Manual Testing Checklist

## Pre-requisites
- [ ] `.env` configured with all WHATSAPP_* variables
- [ ] Queue worker running: `php artisan queue:work`
- [ ] Laravel Reverb running: `php artisan reverb:start` (for WebSocket)
- [ ] Frontend dev server: `npm run dev`

## Backend Testing (Simulation Mode)

### Webhook
- [ ] GET `/api/v1/whatsapp/webhook` with valid token returns challenge
- [ ] GET with invalid token returns 403
- [ ] POST with text message payload dispatches job (check logs)
- [ ] POST with non-text payload returns 200 but doesn't queue

### Chat Management (Admin)
- [ ] Login as Admin
- [ ] GET `/api/v1/whatsapp/chats` returns paginated list
- [ ] GET `/api/v1/whatsapp/chats/{id}` returns detail with messages
- [ ] POST `/api/v1/whatsapp/chats/{id}/takeover` sets flags correctly
- [ ] POST `/api/v1/whatsapp/chats/{id}/send` queues message job

### Booking
- [ ] Booking validation rejects Sunday
- [ ] Booking validation rejects same day (H-1 rule)
- [ ] Booking validation rejects outside 08:00-17:00
- [ ] Booking validation rejects when 5 slots full
- [ ] POST `/api/v1/whatsapp/bookings/{id}/approve` creates service order
- [ ] Approve also creates customer if not exists
- [ ] POST `/api/v1/whatsapp/bookings/{id}/reject` requires reason

### RBAC
- [ ] Cashier GET `/api/v1/whatsapp/chats` returns 403

## Frontend Testing

### Navigation
- [ ] Admin sees "Chat WhatsApp" in sidebar
- [ ] Cashier does NOT see menu item
- [ ] Route `/whatsapp-chats` renders page

### Chat List
- [ ] Shows phone numbers with latest message preview
- [ ] Status badges display correctly (Bot Aktif, Admin Takeover, Menunggu)
- [ ] Filter dropdown works (all, bot_active, admin_takeover)
- [ ] Clicking chat loads detail window

### Chat Window
- [ ] Messages display with correct alignment (customer left, admin/bot right)
- [ ] Bot messages have green background
- [ ] Event messages (bot activated, takeover) show italic
- [ ] "Ambil Alih" button sets admin_takeover flag
- [ ] "Lepas Kontrol" button resets flags
- [ ] Message input + Send button work
- [ ] Enter key sends message

### WebSocket (Real-time)
- [ ] New message from another session appears instantly
- [ ] Toast notification shows on new message
- [ ] New booking shows toast notification

## Integration Testing (End-to-End)

### Bot Activation Flow
1. [ ] Simulate incoming message from new customer
2. [ ] Verify chat created with bot_active=false
3. [ ] Wait 5 minutes (or mock timer)
4. [ ] Verify bot_active=true
5. [ ] Verify greeting message sent (check logs in simulation mode)

### Admin Takeover Flow
1. [ ] Bot is active in a chat
2. [ ] Admin clicks "Ambil Alih"
3. [ ] Verify bot_active=false, admin_takeover=true
4. [ ] New customer message does NOT trigger bot
5. [ ] Admin sends manual reply
6. [ ] Admin clicks "Lepas Kontrol"
7. [ ] Next customer message triggers 5-min timer again

### Booking Approval Flow
1. [ ] Create pending booking (via API or factory)
2. [ ] Admin opens booking modal
3. [ ] Click "Setujui Booking"
4. [ ] Verify service_order created in database
5. [ ] Verify customer created/updated
6. [ ] Verify booking.status = 'APPROVED'
7. [ ] Verify WhatsApp notification sent (log in simulation)

## Production Readiness (After API Keys Ready)

- [ ] Set `WHATSAPP_SIMULATION_MODE=false`
- [ ] Set real `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`
- [ ] Set real `GEMINI_API_KEY`
- [ ] Configure webhook URL in Meta Business Manager
- [ ] Test real WhatsApp message → bot responds
- [ ] Monitor logs for errors
- [ ] Verify cleanup command: `php artisan whatsapp:cleanup`
