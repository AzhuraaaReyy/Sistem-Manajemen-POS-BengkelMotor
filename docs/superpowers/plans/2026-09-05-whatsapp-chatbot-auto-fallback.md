# WhatsApp Chatbot Auto-Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan WhatsApp Chatbot otomatis dengan auto-fallback 5 menit, integrasi Gemini AI untuk menjawab pertanyaan dinamis berdasarkan data real-time (produk, servis, jam buka), fitur booking servis, dan admin takeover via dashboard dengan WebSocket real-time notification.

**Architecture:** Webhook menerima pesan dari Meta WhatsApp Cloud API → Queue job dengan timer 5 menit → Jika admin tidak balas, bot aktif menggunakan Gemini AI (dengan context database produk/servis) → Response dikirim kembali via WhatsApp API. Admin dapat ambil alih chat kapan saja dari dashboard `/whatsapp-chats`, dengan notifikasi real-time via Laravel Reverb (WebSocket). Booking yang diapprove otomatis membuat service order.

**Tech Stack:** Laravel 12, Meta WhatsApp Cloud API, Google Gemini AI 1.5 Flash, Laravel Reverb (WebSocket), Queue Database Driver, React TypeScript (frontend dashboard), Sanctum Auth

**Spec:** `docs/superpowers/specs/2026-09-05-whatsapp-chatbot-design.md`

## Global Constraints

- PHP ^8.2, Laravel ^12.0
- Meta WhatsApp Cloud API v18.0
- Google Gemini AI 1.5 Flash model
- Simulation mode support (WHATSAPP_SIMULATION_MODE=true untuk testing tanpa API key)
- RBAC: Admin only untuk WhatsApp chat management
- Webhook signature verification wajib di production mode
- Rate limiting: 60 webhook/menit per IP
- Data retention: Chat 60 hari, Booking 365 hari
- Timer 5 menit di-reset setiap pesan baru dari pelanggan
- Booking validation: H-1 minimal, Senin-Sabtu only, jam 08:00-17:00, max 5 slot/hari
- Auto-create service_orders saat booking APPROVED
- WebSocket real-time notification via Laravel Reverb

---

## File Structure Overview

### Backend (Laravel)

**Migrations:**
- `database/migrations/2026_09_05_100001_create_whatsapp_chats_table.php`
- `database/migrations/2026_09_05_100002_create_whatsapp_messages_table.php`
- `database/migrations/2026_09_05_100003_create_whatsapp_bookings_table.php`
- `database/migrations/2026_09_05_100004_add_service_order_id_to_whatsapp_bookings.php`

**Models:**
- `app/Models/WhatsAppChat.php`
- `app/Models/WhatsAppMessage.php`
- `app/Models/WhatsAppBooking.php`

**Services:**
- `app/Services/WhatsApp/Contracts/MessagingGateway.php` (Interface)
- `app/Services/WhatsApp/WhatsAppService.php`
- `app/Services/WhatsApp/GeminiAIService.php`
- `app/Services/WhatsApp/BotConversationService.php`
- `app/Services/WhatsApp/BookingService.php`

**Jobs:**
- `app/Jobs/WhatsApp/ActivateBotIfNoAdminReply.php`
- `app/Jobs/WhatsApp/ProcessIncomingWhatsAppMessage.php`
- `app/Jobs/WhatsApp/SendWhatsAppMessage.php`

**Controllers:**
- `app/Http/Controllers/Api/WhatsAppWebhookController.php`
- `app/Http/Controllers/Api/WhatsAppChatController.php`
- `app/Http/Controllers/Api/WhatsAppBookingController.php`

**Events:**
- `app/Events/WhatsApp/NewWhatsAppMessage.php`
- `app/Events/WhatsApp/NewWhatsAppBooking.php`

**Commands:**
- `app/Console/Commands/CleanupWhatsAppData.php`

**Config:**
- `config/whatsapp.php`

**Routes:**
- Modify: `routes/api.php` (tambah WhatsApp routes)
- Modify: `bootstrap/app.php` (CSRF exception untuk webhook)

**Factories:**
- `database/factories/WhatsAppChatFactory.php`
- `database/factories/WhatsAppMessageFactory.php`
- `database/factories/WhatsAppBookingFactory.php`

**Tests:**
- `tests/Unit/Services/WhatsApp/GeminiAIServiceTest.php`
- `tests/Unit/Services/WhatsApp/BookingServiceTest.php`
- `tests/Feature/WhatsApp/WebhookTest.php`
- `tests/Feature/WhatsApp/ChatManagementTest.php`
- `tests/Feature/WhatsApp/BookingTest.php`

### Frontend (React TypeScript)

**Features:**
- `frontend/src/features/whatsapp/WhatsAppChatsPage.tsx`
- `frontend/src/features/whatsapp/ChatWindow.tsx`
- `frontend/src/features/whatsapp/ChatList.tsx`
- `frontend/src/features/whatsapp/BookingApprovalModal.tsx`
- `frontend/src/features/whatsapp/ChatStatusBadge.tsx`
- `frontend/src/features/whatsapp/types.ts`

**API Client:**
- `frontend/src/lib/api/whatsapp.ts`

**WebSocket:**
- `frontend/src/lib/websocket.ts`

**Router & Navigation:**
- Modify: `frontend/src/App.tsx` (tambah route `/whatsapp-chats`)
- Modify: `frontend/src/layouts/AppShell.tsx` (sidebar menu + PAGE_META)

---

## Task 1: Database Migrations & Models

**Files:**
- Create: `database/migrations/2026_09_05_100001_create_whatsapp_chats_table.php`
- Create: `database/migrations/2026_09_05_100002_create_whatsapp_messages_table.php`
- Create: `database/migrations/2026_09_05_100003_create_whatsapp_bookings_table.php`
- Create: `database/migrations/2026_09_05_100004_add_service_order_id_to_whatsapp_bookings.php`
- Create: `app/Models/WhatsAppChat.php`
- Create: `app/Models/WhatsAppMessage.php`
- Create: `app/Models/WhatsAppBooking.php`

**Interfaces:**
- Consumes: Laravel framework (Schema, Model, Eloquent)
- Produces: 
  - `WhatsAppChat::class` (eloquent model with fillable: phone_number, last_message_at, last_message_from, bot_active, admin_takeover)
  - `WhatsAppMessage::class` (eloquent model with fillable: chat_id, direction, sender_type, message_text, event_type, meta_message_id)
  - `WhatsAppBooking::class` (eloquent model with fillable: chat_id, customer_name, phone_number, booking_date, booking_time, tnkb, motorcycle_type, complaint, status, approved_by, approved_at, rejection_reason, service_order_id)

- [ ] **Step 1: Create whatsapp_chats migration**

```bash
cd D:/PORTOFOLIO/BengkelMotor/backend
php artisan make:migration create_whatsapp_chats_table
```

Expected: Migration file created in `database/migrations/`

- [ ] **Step 2: Write whatsapp_chats migration schema**

Edit the created migration file:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_chats', function (Blueprint $table) {
            $table->id();
            $table->string('phone_number', 30)->unique();
            $table->timestamp('last_message_at');
            $table->enum('last_message_from', ['customer', 'admin', 'bot']);
            $table->boolean('bot_active')->default(false);
            $table->boolean('admin_takeover')->default(false);
            $table->timestamps();

            $table->index(['bot_active', 'updated_at']);
            $table->index(['admin_takeover', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_chats');
    }
};
```

- [ ] **Step 3: Create whatsapp_messages migration**

```bash
php artisan make:migration create_whatsapp_messages_table
```

- [ ] **Step 4: Write whatsapp_messages migration schema**

Edit the created migration file:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_id')->constrained('whatsapp_chats')->onDelete('cascade');
            $table->enum('direction', ['inbound', 'outbound']);
            $table->enum('sender_type', ['customer', 'admin', 'bot']);
            $table->text('message_text')->nullable();
            $table->string('event_type', 50)->nullable();
            $table->string('meta_message_id', 100)->nullable();
            $table->timestamps();

            $table->index(['chat_id', 'created_at']);
            $table->index(['event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_messages');
    }
};
```

- [ ] **Step 5: Create whatsapp_bookings migration**

```bash
php artisan make:migration create_whatsapp_bookings_table
```

- [ ] **Step 6: Write whatsapp_bookings migration schema**

Edit the created migration file:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_id')->constrained('whatsapp_chats')->onDelete('cascade');
            $table->string('customer_name', 120);
            $table->string('phone_number', 30);
            $table->date('booking_date');
            $table->time('booking_time');
            $table->string('tnkb', 20);
            $table->string('motorcycle_type', 100);
            $table->text('complaint');
            $table->enum('status', ['PENDING', 'APPROVED', 'REJECTED'])->default('PENDING');
            $table->foreignId('approved_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('approved_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['booking_date', 'booking_time']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_bookings');
    }
};
```

- [ ] **Step 7: Create service_order_id link migration**

```bash
php artisan make:migration add_service_order_id_to_whatsapp_bookings
```

- [ ] **Step 8: Write service_order_id link migration**

Edit the created migration file:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_bookings', function (Blueprint $table) {
            $table->foreignId('service_order_id')->nullable()->after('rejection_reason')->constrained()->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_bookings', function (Blueprint $table) {
            $table->dropForeign(['service_order_id']);
            $table->dropColumn('service_order_id');
        });
    }
};
```

- [ ] **Step 9: Run migrations**

```bash
php artisan migrate
```

Expected: All 4 migrations run successfully

- [ ] **Step 10: Create WhatsAppChat model**

```bash
php artisan make:model WhatsAppChat
```

- [ ] **Step 11: Write WhatsAppChat model**

Edit `app/Models/WhatsAppChat.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsAppChat extends Model
{
    use HasFactory;

    protected $fillable = [
        'phone_number',
        'last_message_at',
        'last_message_from',
        'bot_active',
        'admin_takeover',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
        'bot_active' => 'boolean',
        'admin_takeover' => 'boolean',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(WhatsAppMessage::class, 'chat_id');
    }

    public function latestMessage(): HasMany
    {
        return $this->messages()->one()->latestOfMany();
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(WhatsAppBooking::class, 'chat_id');
    }
}
```

- [ ] **Step 12: Create WhatsAppMessage model**

```bash
php artisan make:model WhatsAppMessage
```

- [ ] **Step 13: Write WhatsAppMessage model**

Edit `app/Models/WhatsAppMessage.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppMessage extends Model
{
    use HasFactory;

    protected $fillable = [
        'chat_id',
        'direction',
        'sender_type',
        'message_text',
        'event_type',
        'meta_message_id',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function chat(): BelongsTo
    {
        return $this->belongsTo(WhatsAppChat::class, 'chat_id');
    }
}
```

- [ ] **Step 14: Create WhatsAppBooking model**

```bash
php artisan make:model WhatsAppBooking
```

- [ ] **Step 15: Write WhatsAppBooking model**

Edit `app/Models/WhatsAppBooking.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppBooking extends Model
{
    use HasFactory;

    protected $fillable = [
        'chat_id',
        'customer_name',
        'phone_number',
        'booking_date',
        'booking_time',
        'tnkb',
        'motorcycle_type',
        'complaint',
        'status',
        'approved_by',
        'approved_at',
        'rejection_reason',
        'service_order_id',
    ];

    protected $casts = [
        'booking_date' => 'date',
        'approved_at' => 'datetime',
    ];

    public function chat(): BelongsTo
    {
        return $this->belongsTo(WhatsAppChat::class, 'chat_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function serviceOrder(): BelongsTo
    {
        return $this->belongsTo(ServiceOrder::class, 'service_order_id');
    }
}
```

- [ ] **Step 16: Verify models can be instantiated**

```bash
php artisan tinker
```

Run in tinker:
```php
new App\Models\WhatsAppChat();
new App\Models\WhatsAppMessage();
new App\Models\WhatsAppBooking();
exit
```

Expected: No errors

- [ ] **Step 17: Commit migrations and models**

```bash
git add database/migrations/*whatsapp* app/Models/WhatsApp*.php
git commit -m "feat(whatsapp): add database migrations and models for chatbot"
```

---

## Task 2: Configuration & Environment Setup

**Files:**
- Create: `config/whatsapp.php`
- Modify: `.env.example`
- Modify: `bootstrap/app.php` (CSRF exception)

**Interfaces:**
- Consumes: Laravel config system, env() helper
- Produces:
  - `config('whatsapp.meta.phone_number_id')` → string|null
  - `config('whatsapp.meta.access_token')` → string|null
  - `config('whatsapp.meta.app_secret')` → string|null
  - `config('whatsapp.meta.webhook_verify_token')` → string|null
  - `config('whatsapp.meta.api_url')` → string
  - `config('whatsapp.gemini.api_key')` → string|null
  - `config('whatsapp.gemini.model')` → string
  - `config('whatsapp.gemini.api_url')` → string
  - `config('whatsapp.gemini.cache_ttl')` → int (900 seconds / 15 minutes)
  - `config('whatsapp.operational.hours.open')` → string ('08:00')
  - `config('whatsapp.operational.hours.close')` → string ('17:00')
  - `config('whatsapp.operational.days_off')` → array (['sunday'])
  - `config('whatsapp.operational.max_daily_bookings')` → int (5)
  - `config('whatsapp.operational.booking_min_advance_hours')` → int (24)
  - `config('whatsapp.bot.auto_activate_delay_minutes')` → int (5)
  - `config('whatsapp.bot.greeting_message')` → string
  - `config('whatsapp.bot.fallback_message')` → string
  - `config('whatsapp.simulation_mode')` → bool

- [ ] **Step 1: Create whatsapp config file**

Create `config/whatsapp.php`:

```php
<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Meta WhatsApp Cloud API Configuration
    |--------------------------------------------------------------------------
    |
    | These credentials are obtained from Meta Business Manager after setting
    | up a WhatsApp Business Platform account. Leave empty for simulation mode.
    |
    */

    'meta' => [
        'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),
        'access_token' => env('WHATSAPP_ACCESS_TOKEN'),
        'app_secret' => env('WHATSAPP_APP_SECRET'),
        'webhook_verify_token' => env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
        'api_url' => 'https://graph.facebook.com/v18.0',
    ],

    /*
    |--------------------------------------------------------------------------
    | Google Gemini AI Configuration
    |--------------------------------------------------------------------------
    |
    | Gemini AI is used for natural language processing to answer customer
    | questions dynamically based on real-time database context.
    |
    */

    'gemini' => [
        'api_key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-1.5-flash'),
        'api_url' => 'https://generativelanguage.googleapis.com/v1beta/models',
        'cache_ttl' => 900, // 15 minutes cache for product/service context
    ],

    /*
    |--------------------------------------------------------------------------
    | Operational Settings
    |--------------------------------------------------------------------------
    |
    | Business hours and booking constraints (hardcoded for MVP).
    |
    */

    'operational' => [
        'hours' => [
            'open' => '08:00',
            'close' => '17:00',
        ],
        'days_off' => ['sunday'],
        'max_daily_bookings' => 5,
        'booking_min_advance_hours' => 24, // H-1
    ],

    /*
    |--------------------------------------------------------------------------
    | Bot Behavior Configuration
    |--------------------------------------------------------------------------
    |
    | Settings that control how the chatbot behaves.
    |
    */

    'bot' => [
        'auto_activate_delay_minutes' => 5,
        'greeting_message' => "Halo! Saya asisten virtual bengkel. Ada yang bisa saya bantu?",
        'fallback_message' => "Maaf, saya belum bisa menjawab pertanyaan itu. Silakan hubungi admin kami.",
    ],

    /*
    |--------------------------------------------------------------------------
    | Simulation Mode
    |--------------------------------------------------------------------------
    |
    | When true: webhook signature verification is bypassed, and WhatsApp API
    | calls are logged instead of sent. Useful for local testing without real
    | Meta credentials. When false: production mode with full security checks.
    |
    */

    'simulation_mode' => (bool) env('WHATSAPP_SIMULATION_MODE', false),

];
```

- [ ] **Step 2: Update .env.example with WhatsApp variables**

Edit `.env.example`, add these lines after the MIDTRANS section:

```env
# =========================================================================
# WHATSAPP CHATBOT - META CLOUD API + GEMINI AI
# =========================================================================
# Meta WhatsApp Business Platform
# Dapatkan credentials dari Meta Business Manager setelah setup
# WhatsApp Business Account: https://business.facebook.com/
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_random_token_here

# Google Gemini AI
# Dapatkan API key gratis dari Google AI Studio: https://aistudio.google.com/
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash

# Simulation Mode (true = testing tanpa API asli, false = production)
WHATSAPP_SIMULATION_MODE=true

# Laravel Broadcasting (untuk WebSocket real-time notification)
BROADCAST_CONNECTION=reverb
REVERB_APP_ID=
REVERB_APP_KEY=
REVERB_APP_SECRET=
REVERB_HOST=localhost
REVERB_PORT=8080
REVERB_SCHEME=http
```

- [ ] **Step 3: Update bootstrap/app.php to exclude WhatsApp webhook from CSRF**

Edit `bootstrap/app.php`, find the `validateCsrfTokens` section and update:

```php
$middleware->validateCsrfTokens(except: [
    'api/v1/payments/webhook/*',
    'api/v1/whatsapp/webhook', // Add this line
]);
```

- [ ] **Step 4: Verify config can be loaded**

```bash
php artisan tinker
```

Run in tinker:
```php
config('whatsapp.meta.api_url');
config('whatsapp.operational.max_daily_bookings');
config('whatsapp.simulation_mode');
exit
```

Expected: Values returned correctly (null for credentials, defaults for others)

- [ ] **Step 5: Commit configuration files**

```bash
git add config/whatsapp.php .env.example bootstrap/app.php
git commit -m "feat(whatsapp): add configuration and environment setup"
```

---

## Task 3: WhatsApp Service (API Integration Layer)

**Files:**
- Create: `app/Services/WhatsApp/Contracts/MessagingGateway.php`
- Create: `app/Services/WhatsApp/WhatsAppService.php`

**Interfaces:**
- Consumes:
  - `config('whatsapp.meta.*')` from Task 2
  - `config('whatsapp.simulation_mode')` from Task 2
  - Laravel `Http` facade, `Log` facade
- Produces:
  - `WhatsAppService::sendMessage(string $phoneNumber, string $message): bool`
  - `WhatsAppService::verifySignature(string $payload, string $signature): bool`
  - `WhatsAppService::parseIncomingMessage(array $payload): ?array` returns `['from' => string, 'message' => string, 'meta_message_id' => string]` or null

- [ ] **Step 1: Write failing test for WhatsAppService simulation mode**

Create `tests/Unit/Services/WhatsApp/WhatsAppServiceTest.php`:

```php
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
                                        'type' => 'image', // Not text
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php artisan test --filter=WhatsAppServiceTest
```

Expected: FAIL - class WhatsAppService not found

- [ ] **Step 3: Create MessagingGateway interface**

Create `app/Services/WhatsApp/Contracts/MessagingGateway.php`:

```php
<?php

namespace App\Services\WhatsApp\Contracts;

interface MessagingGateway
{
    public function sendMessage(string $phoneNumber, string $message): bool;
    
    public function verifySignature(string $payload, string $signature): bool;
    
    public function parseIncomingMessage(array $payload): ?array;
}
```

- [ ] **Step 4: Create WhatsAppService implementation**

Create `app/Services/WhatsApp/WhatsAppService.php`:

```php
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

        // Only handle text messages for now
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
php artisan test --filter=WhatsAppServiceTest
```

Expected: PASS all tests

- [ ] **Step 6: Commit WhatsApp service**

```bash
git add app/Services/WhatsApp/ tests/Unit/Services/WhatsApp/
git commit -m "feat(whatsapp): add WhatsAppService with simulation mode support"
```

---

## Task 4: Gemini AI Service (NLP Processing Layer)

**Files:**
- Create: `app/Services/WhatsApp/GeminiAIService.php`
- Create: `tests/Unit/Services/WhatsApp/GeminiAIServiceTest.php`

**Interfaces:**
- Consumes:
  - `config('whatsapp.gemini.*')` from Task 2
  - `Product::class`, `Service::class` models
  - Laravel `Http`, `Cache`, `Log` facades
- Produces:
  - `GeminiAIService::processQuestion(string $question): string`

- [ ] **Step 1: Write failing test for Gemini AI service**

Create `tests/Unit/Services/WhatsApp/GeminiAIServiceTest.php`:

```php
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

        // Should use rule-based fallback
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
        
        // First call should build context
        $service->processQuestion('test?');
        
        // Delete product from DB
        Product::truncate();
        
        // Second call should still have product in cached context
        $service->processQuestion('test again?');
        
        Http::assertSent(function ($request) {
            $body = json_decode($request->body(), true);
            $context = $body['contents'][0]['parts'][0]['text'] ?? '';
            return str_contains($context, 'Test Product');
        });
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php artisan test --filter=GeminiAIServiceTest
```

Expected: FAIL - class GeminiAIService not found

- [ ] **Step 3: Create GeminiAIService implementation**

Create `app/Services/WhatsApp/GeminiAIService.php`:

```php
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
php artisan test --filter=GeminiAIServiceTest
```

Expected: PASS all tests

- [ ] **Step 5: Commit Gemini AI service**

```bash
git add app/Services/WhatsApp/GeminiAIService.php tests/Unit/Services/WhatsApp/GeminiAIServiceTest.php
git commit -m "feat(whatsapp): add Gemini AI service with fallback mechanism"
```

---

## Task 5: Booking Service (Business Logic Layer)

**Files:**
- Create: `app/Services/WhatsApp/BookingService.php`
- Create: `tests/Unit/Services/WhatsApp/BookingServiceTest.php`

**Interfaces:**
- Consumes:
  - `WhatsAppChat::class` from Task 1
  - `WhatsAppBooking::class` from Task 1
  - `Customer::class`, `User::class`, `ServiceOrder::class` (existing models)
  - `NotificationService::class` (existing service)
  - `WhatsAppService::sendMessage()` from Task 3
  - `config('whatsapp.operational.*')` from Task 2
- Produces:
  - `BookingService::createBooking(WhatsAppChat $chat, array $data): WhatsAppBooking`
  - `BookingService::isSlotAvailable(Carbon $date): bool`
  - `BookingService::approve(WhatsAppBooking $booking, User $admin): void`
  - `BookingService::reject(WhatsAppBooking $booking, User $admin, string $reason): void`

- [ ] **Step 1: Write failing test for BookingService**

Create `tests/Unit/Services/WhatsApp/BookingServiceTest.php`:

```php
<?php

namespace Tests\Unit\Services\WhatsApp;

use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use App\Services\Notifications\NotificationService;
use App\Services\WhatsApp\BookingService;
use App\Services\WhatsApp\WhatsAppService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class BookingServiceTest extends TestCase
{
    use RefreshDatabase;

    private BookingService $service;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->service = new BookingService(
            $this->mock(NotificationService::class),
            $this->mock(WhatsAppService::class),
        );
    }

    public function test_create_booking_rejects_sunday(): void
    {
        $chat = WhatsAppChat::factory()->create();
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('libur di hari Minggu');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => Carbon::parse('2026-09-06')->toDateString(), // Sunday
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_rejects_same_day(): void
    {
        $chat = WhatsAppChat::factory()->create();
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('minimal H-1');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => today()->toDateString(),
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_rejects_outside_operational_hours(): void
    {
        $chat = WhatsAppChat::factory()->create();
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('08:00 - 17:00');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => today()->addDays(2)->toDateString(),
            'booking_time' => '19:00', // After close
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_rejects_when_slots_full(): void
    {
        $date = today()->addDays(2);
        $chat = WhatsAppChat::factory()->create();
        
        // Create 5 existing bookings (max)
        WhatsAppBooking::factory()->count(5)->create([
            'booking_date' => $date,
            'status' => 'PENDING',
        ]);
        
        $this->expectException(ValidationException::class);
        $this->expectExceptionMessage('slot.*penuh');

        $this->service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => $date->toDateString(),
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);
    }

    public function test_create_booking_succeeds_with_valid_data(): void
    {
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $admin = User::factory()->admin()->create();

        $notificationService = $this->mock(NotificationService::class);
        $notificationService->shouldReceive('create')->once();

        $service = new BookingService($notificationService, $this->mock(WhatsAppService::class));

        $booking = $service->createBooking($chat, [
            'customer_name' => 'John Doe',
            'booking_date' => today()->addDays(2)->toDateString(),
            'booking_time' => '10:00',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'complaint' => 'Ganti oli',
        ]);

        $this->assertInstanceOf(WhatsAppBooking::class, $booking);
        $this->assertEquals('PENDING', $booking->status);
        $this->assertEquals('John Doe', $booking->customer_name);
        $this->assertEquals('628123456789', $booking->phone_number);
    }

    public function test_approve_creates_service_order_and_sends_notification(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'customer_name' => 'John Doe',
            'phone_number' => '628123456789',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario 160',
            'status' => 'PENDING',
        ]);

        $whatsappService = $this->mock(WhatsAppService::class);
        $whatsappService->shouldReceive('sendMessage')
            ->once()
            ->with('628123456789', \Mockery::on(function ($msg) {
                return str_contains($msg, 'Booking Anda Disetujui');
            }))
            ->andReturn(true);

        $service = new BookingService(
            $this->mock(NotificationService::class),
            $whatsappService
        );

        $service->approve($booking, $admin);

        $booking->refresh();
        $this->assertEquals('APPROVED', $booking->status);
        $this->assertEquals($admin->id, $booking->approved_by);
        $this->assertNotNull($booking->approved_at);
        $this->assertNotNull($booking->service_order_id);

        $serviceOrder = ServiceOrder::find($booking->service_order_id);
        $this->assertNotNull($serviceOrder);
        $this->assertEquals('Honda Vario 160', $serviceOrder->motorcycle_type);
        $this->assertEquals('OPEN', $serviceOrder->status);
    }

    public function test_approve_creates_customer_if_not_exists(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'phone_number' => '628123456789',
            'customer_name' => 'New Customer',
            'status' => 'PENDING',
        ]);

        $service = new BookingService(
            $this->mock(NotificationService::class),
            $this->mock(WhatsAppService::class)
        );

        $service->approve($booking, $admin);

        $customer = Customer::where('phone', '628123456789')->first();
        $this->assertNotNull($customer);
        $this->assertEquals('New Customer', $customer->name);
    }

    public function test_reject_updates_status_and_sends_notification(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'phone_number' => '628123456789',
            'status' => 'PENDING',
        ]);

        $whatsappService = $this->mock(WhatsAppService::class);
        $whatsappService->shouldReceive('sendMessage')
            ->once()
            ->with('628123456789', \Mockery::on(function ($msg) {
                return str_contains($msg, 'Booking Anda Ditolak');
            }))
            ->andReturn(true);

        $service = new BookingService(
            $this->mock(NotificationService::class),
            $whatsappService
        );

        $service->reject($booking, $admin, 'Slot penuh');

        $booking->refresh();
        $this->assertEquals('REJECTED', $booking->status);
        $this->assertEquals('Slot penuh', $booking->rejection_reason);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php artisan test --filter=BookingServiceTest
```

Expected: FAIL - class BookingService not found

- [ ] **Step 3: Create BookingService implementation**

Create `app/Services/WhatsApp/BookingService.php`:

```php
<?php

namespace App\Services\WhatsApp;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use App\Services\Notifications\NotificationService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BookingService
{
    public function __construct(
        private NotificationService $notificationService,
        private WhatsAppService $whatsappService,
    ) {}

    public function createBooking(WhatsAppChat $chat, array $data): WhatsAppBooking
    {
        $data = $this->sanitizeBookingData($data);
        
        $date = Carbon::parse($data['booking_date']);
        $time = Carbon::parse($data['booking_time']);

        // Validation 1: No Sunday
        if ($date->isSunday()) {
            throw ValidationException::withMessages([
                'booking_date' => 'Maaf, kami libur di hari Minggu.',
            ]);
        }

        // Validation 2: Minimum H-1
        if ($date->isSameDay(today())) {
            throw ValidationException::withMessages([
                'booking_date' => 'Booking minimal H-1. Silakan pilih tanggal besok atau setelahnya.',
            ]);
        }

        // Validation 3: Operational hours
        $openTime = Carbon::parse(config('whatsapp.operational.hours.open'));
        $closeTime = Carbon::parse(config('whatsapp.operational.hours.close'));
        
        if ($time->lt($openTime) || $time->gt($closeTime)) {
            throw ValidationException::withMessages([
                'booking_time' => 'Jam booking harus antara 08:00 - 17:00 WIB.',
            ]);
        }

        // Validation 4: Max slots per day
        if (!$this->isSlotAvailable($date)) {
            throw ValidationException::withMessages([
                'booking_date' => 'Maaf, slot booking untuk tanggal tersebut sudah penuh. Silakan pilih tanggal lain.',
            ]);
        }

        // Create booking
        $booking = WhatsAppBooking::create([
            'chat_id' => $chat->id,
            'customer_name' => $data['customer_name'],
            'phone_number' => $chat->phone_number,
            'booking_date' => $date,
            'booking_time' => $time,
            'tnkb' => $data['tnkb'],
            'motorcycle_type' => $data['motorcycle_type'],
            'complaint' => $data['complaint'],
            'status' => 'PENDING',
        ]);

        // Notify all admins
        $admins = User::where('role', 'ADMIN')->where('is_active', true)->get();
        foreach ($admins as $admin) {
            $this->notificationService->create(
                $admin,
                'SYSTEM',
                'Booking WhatsApp Baru',
                "Booking dari {$booking->customer_name} ({$booking->phone_number}) untuk {$date->format('d/m/Y')} jam {$time->format('H:i')}",
                [
                    'booking_id' => $booking->id,
                    'action_url' => '/whatsapp-chats?booking=' . $booking->id,
                ]
            );
        }

        return $booking;
    }

    public function isSlotAvailable(Carbon $date): bool
    {
        $existingCount = WhatsAppBooking::whereDate('booking_date', $date)
            ->whereIn('status', ['PENDING', 'APPROVED'])
            ->count();

        return $existingCount < config('whatsapp.operational.max_daily_bookings', 5);
    }

    public function approve(WhatsAppBooking $booking, User $admin): void
    {
        DB::transaction(function () use ($booking, $admin) {
            // 1. Update booking status
            $booking->update([
                'status' => 'APPROVED',
                'approved_by' => $admin->id,
                'approved_at' => now(),
            ]);

            // 2. Get or create customer
            $customerId = $this->getOrCreateCustomer($booking);

            // 3. Auto-create service order
            $serviceOrder = ServiceOrder::create([
                'order_code' => 'SO-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6)),
                'customer_id' => $customerId,
                'motorcycle_type' => $booking->motorcycle_type,
                'cashier_id' => $admin->id,
                'mechanic_id' => null,
                'complaint' => $booking->complaint,
                'diagnosis_note' => "Auto-created dari booking WhatsApp (ID: {$booking->id})",
                'status' => 'OPEN',
                'opened_at' => Carbon::parse($booking->booking_date . ' ' . $booking->booking_time),
            ]);

            // 4. Link booking to service order
            $booking->update(['service_order_id' => $serviceOrder->id]);

            // 5. Send WhatsApp notification to customer
            $this->whatsappService->sendMessage(
                $booking->phone_number,
                "✅ *Booking Anda Disetujui!*\n\n" .
                "Kode Order: {$serviceOrder->order_code}\n" .
                "Tanggal: " . Carbon::parse($booking->booking_date)->isoFormat('dddd, D MMMM YYYY') . "\n" .
                "Jam: {$booking->booking_time}\n" .
                "Motor: {$booking->motorcycle_type} ({$booking->tnkb})\n\n" .
                "Silakan datang sesuai jadwal. Terima kasih! 🙏"
            );

            // 6. Audit log
            AuditLog::create([
                'user_id' => $admin->id,
                'action' => 'BOOKING_APPROVED',
                'entity_type' => 'WhatsAppBooking',
                'entity_id' => $booking->id,
                'ip_address' => request()->ip(),
                'changes' => json_encode([
                    'booking_id' => $booking->id,
                    'service_order_id' => $serviceOrder->id,
                    'customer_name' => $booking->customer_name,
                ]),
            ]);
        });
    }

    public function reject(WhatsAppBooking $booking, User $admin, string $reason): void
    {
        $booking->update([
            'status' => 'REJECTED',
            'approved_by' => $admin->id,
            'approved_at' => now(),
            'rejection_reason' => $reason,
        ]);

        // Send WhatsApp notification
        $this->whatsappService->sendMessage(
            $booking->phone_number,
            "❌ *Booking Anda Ditolak*\n\n" .
            "Tanggal: " . Carbon::parse($booking->booking_date)->isoFormat('dddd, D MMMM YYYY') . "\n" .
            "Alasan: {$reason}\n\n" .
            "Silakan hubungi admin untuk informasi lebih lanjut."
        );

        AuditLog::create([
            'user_id' => $admin->id,
            'action' => 'BOOKING_REJECTED',
            'entity_type' => 'WhatsAppBooking',
            'entity_id' => $booking->id,
            'ip_address' => request()->ip(),
            'changes' => json_encode(['reason' => $reason]),
        ]);
    }

    private function getOrCreateCustomer(WhatsAppBooking $booking): int
    {
        $customer = Customer::where('phone', $booking->phone_number)->first();

        if (!$customer) {
            $customer = Customer::create([
                'name' => $booking->customer_name,
                'phone' => $booking->phone_number,
                'motorcycle_type' => $booking->motorcycle_type,
                'notes' => "Auto-created dari booking WhatsApp",
            ]);
        } else {
            $customer->update(['motorcycle_type' => $booking->motorcycle_type]);
        }

        return $customer->id;
    }

    private function sanitizeBookingData(array $data): array
    {
        return [
            'customer_name' => strip_tags(trim($data['customer_name'])),
            'tnkb' => strtoupper(preg_replace('/[^A-Z0-9]/', '', $data['tnkb'])),
            'motorcycle_type' => strip_tags(trim($data['motorcycle_type'])),
            'complaint' => strip_tags(trim($data['complaint'])),
            'booking_date' => Carbon::parse($data['booking_date'])->toDateString(),
            'booking_time' => Carbon::parse($data['booking_time'])->format('H:i:s'),
        ];
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
php artisan test --filter=BookingServiceTest
```

Expected: PASS all tests

- [ ] **Step 5: Commit BookingService**

```bash
git add app/Services/WhatsApp/BookingService.php tests/Unit/Services/WhatsApp/BookingServiceTest.php
git commit -m "feat(whatsapp): add booking service with validation and auto service order creation"
```

---

---

## Task 6: Bot Conversation Service (Orchestration Layer)

**Files:**
- Create: `app/Services/WhatsApp/BotConversationService.php`

**Interfaces:**
- Consumes:
  - `WhatsAppChat::class`, `WhatsAppMessage::class` from Task 1
  - `GeminiAIService::processQuestion()` from Task 4
  - `WhatsAppService::sendMessage()` from Task 3
  - `BookingService::class` from Task 5
- Produces:
  - `BotConversationService::handleMessage(WhatsAppChat $chat, string $message): void`
  - `BotConversationService::sendGreeting(WhatsAppChat $chat): void`

- [ ] **Step 1: Create BotConversationService**

Create `app/Services/WhatsApp/BotConversationService.php`:

```php
<?php

namespace App\Services\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use Illuminate\Support\Str;

class BotConversationService
{
    public function __construct(
        private GeminiAIService $gemini,
        private WhatsAppService $whatsapp,
        private BookingService $booking,
    ) {}

    public function handleMessage(WhatsAppChat $chat, string $message): void
    {
        // 1. Save incoming message
        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'inbound',
            'sender_type' => 'customer',
            'message_text' => $message,
        ]);

        // 2. Process with Gemini AI
        $response = $this->gemini->processQuestion($message);

        // 3. Detect booking intent
        if (Str::contains(strtolower($response), ['booking', 'reservasi', 'pesan servis'])) {
            $response .= "\n\nUntuk booking, saya butuh data berikut:\n";
            $response .= "1. Nama Anda\n2. TNKB (Plat Nomor)\n3. Tipe & Model Motor\n4. Keluhan/Jenis Servis\n5. Tanggal & Waktu yang diinginkan";
        }

        // 4. Send response to customer
        $this->whatsapp->sendMessage($chat->phone_number, $response);

        // 5. Log outgoing message
        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'outbound',
            'sender_type' => 'bot',
            'message_text' => $response,
        ]);

        // 6. Update chat timestamp
        $chat->update([
            'last_message_at' => now(),
            'last_message_from' => 'bot',
        ]);
    }

    public function sendGreeting(WhatsAppChat $chat): void
    {
        $greeting = config('whatsapp.bot.greeting_message');
        
        $this->whatsapp->sendMessage($chat->phone_number, $greeting);

        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'outbound',
            'sender_type' => 'bot',
            'message_text' => $greeting,
            'event_type' => 'bot_greeting',
        ]);

        $chat->update([
            'last_message_at' => now(),
            'last_message_from' => 'bot',
        ]);
    }
}
```

- [ ] **Step 2: Verify service can be instantiated**

```bash
php artisan tinker
```

Run in tinker:
```php
app(\App\Services\WhatsApp\BotConversationService::class);
exit
```

Expected: No errors (dependencies auto-resolved)

- [ ] **Step 3: Commit BotConversationService**

```bash
git add app/Services/WhatsApp/BotConversationService.php
git commit -m "feat(whatsapp): add bot conversation orchestration service"
```

---

## Task 7: Queue Jobs (Async Processing)

**Files:**
- Create: `app/Jobs/WhatsApp/ActivateBotIfNoAdminReply.php`
- Create: `app/Jobs/WhatsApp/ProcessIncomingWhatsAppMessage.php`
- Create: `app/Jobs/WhatsApp/SendWhatsAppMessage.php`

**Interfaces:**
- Consumes:
  - `WhatsAppChat::class`, `WhatsAppMessage::class` from Task 1
  - `BotConversationService::class` from Task 6
  - `WhatsAppService::class` from Task 3
- Produces:
  - `ActivateBotIfNoAdminReply::dispatch(int $chatId)->delay(5 minutes)`
  - `ProcessIncomingWhatsAppMessage::dispatch(string $phoneNumber, string $message, ?string $metaMessageId)`
  - `SendWhatsAppMessage::dispatch(string $phoneNumber, string $message, int $chatId, string $senderType)`

- [ ] **Step 1: Create ActivateBotIfNoAdminReply job**

```bash
php artisan make:job WhatsApp/ActivateBotIfNoAdminReply
```

- [ ] **Step 2: Write ActivateBotIfNoAdminReply implementation**

Edit `app/Jobs/WhatsApp/ActivateBotIfNoAdminReply.php`:

```php
<?php

namespace App\Jobs\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\BotConversationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

class ActivateBotIfNoAdminReply implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        private int $chatId,
    ) {}

    public function handle(BotConversationService $bot): void
    {
        $chat = WhatsAppChat::find($this->chatId);

        if (!$chat) {
            return; // Chat was deleted
        }

        // Check conditions: admin already replied? or admin takeover?
        if ($chat->admin_takeover) {
            return; // Admin took over, don't activate bot
        }

        if ($chat->last_message_from === 'admin') {
            return; // Admin already replied
        }

        // Check if 5 minutes have passed since last customer message
        if ($chat->last_message_at->diffInMinutes(now()) < 5) {
            return; // Not yet 5 minutes (edge case: timer was reset)
        }

        // Activate bot
        $chat->update(['bot_active' => true]);

        // Log event
        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'outbound',
            'sender_type' => 'bot',
            'event_type' => 'bot_activated',
            'message_text' => null,
        ]);

        // Send greeting
        $bot->sendGreeting($chat);
    }

    public function failed(Throwable $exception): void
    {
        Log::error('ActivateBotIfNoAdminReply failed', [
            'chat_id' => $this->chatId,
            'error' => $exception->getMessage(),
        ]);
    }
}
```

- [ ] **Step 3: Create ProcessIncomingWhatsAppMessage job**

```bash
php artisan make:job WhatsApp/ProcessIncomingWhatsAppMessage
```

- [ ] **Step 4: Write ProcessIncomingWhatsAppMessage implementation**

Edit `app/Jobs/WhatsApp/ProcessIncomingWhatsAppMessage.php`:

```php
<?php

namespace App\Jobs\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\BotConversationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessIncomingWhatsAppMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        private string $phoneNumber,
        private string $message,
        private ?string $metaMessageId = null,
    ) {}

    public function handle(BotConversationService $bot): void
    {
        // 1. Find or create chat record
        $chat = WhatsAppChat::firstOrCreate(
            ['phone_number' => $this->phoneNumber],
            [
                'last_message_at' => now(),
                'last_message_from' => 'customer',
                'bot_active' => false,
                'admin_takeover' => false,
            ]
        );

        $wasNewChat = $chat->wasRecentlyCreated;

        // 2. Update timestamp
        $chat->update([
            'last_message_at' => now(),
            'last_message_from' => 'customer',
        ]);

        // 3. Save message to log
        WhatsAppMessage::create([
            'chat_id' => $chat->id,
            'direction' => 'inbound',
            'sender_type' => 'customer',
            'message_text' => $this->message,
            'meta_message_id' => $this->metaMessageId,
        ]);

        // 4. Route based on state
        if ($chat->admin_takeover) {
            // Admin is handling, don't auto-reply
            return;
        }

        if ($chat->bot_active) {
            // Bot is already active, process immediately
            $bot->handleMessage($chat, $this->message);
            return;
        }

        // 5. New chat or timer reset: dispatch delayed job (5 minutes)
        ActivateBotIfNoAdminReply::dispatch($chat->id)
            ->delay(now()->addMinutes(config('whatsapp.bot.auto_activate_delay_minutes', 5)));
    }
}
```

- [ ] **Step 5: Create SendWhatsAppMessage job**

```bash
php artisan make:job WhatsApp/SendWhatsAppMessage
```

- [ ] **Step 6: Write SendWhatsAppMessage implementation**

Edit `app/Jobs/WhatsApp/SendWhatsAppMessage.php`:

```php
<?php

namespace App\Jobs\WhatsApp;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendWhatsAppMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        private string $phoneNumber,
        private string $message,
        private int $chatId,
        private string $senderType = 'admin',
    ) {}

    public function handle(WhatsAppService $whatsapp): void
    {
        $success = $whatsapp->sendMessage($this->phoneNumber, $this->message);

        if ($success) {
            // Log outgoing message
            WhatsAppMessage::create([
                'chat_id' => $this->chatId,
                'direction' => 'outbound',
                'sender_type' => $this->senderType,
                'message_text' => $this->message,
            ]);

            // Update chat state
            WhatsAppChat::find($this->chatId)?->update([
                'last_message_at' => now(),
                'last_message_from' => $this->senderType,
            ]);
        } else {
            Log::error('Failed to send WhatsApp message', [
                'phone' => $this->phoneNumber,
                'chat_id' => $this->chatId,
            ]);
        }
    }
}
```

- [ ] **Step 7: Verify jobs can be dispatched**

```bash
php artisan tinker
```

Run in tinker:
```php
\App\Jobs\WhatsApp\ProcessIncomingWhatsAppMessage::dispatch('628123456789', 'Test', null);
\App\Models\WhatsAppChat::factory()->create();
exit
```

Expected: Job queued successfully

- [ ] **Step 8: Commit queue jobs**

```bash
git add app/Jobs/WhatsApp/
git commit -m "feat(whatsapp): add queue jobs for async message processing and bot activation"
```

---

## Task 8: Webhook Controller

**Files:**
- Create: `app/Http/Controllers/Api/WhatsAppWebhookController.php`

**Interfaces:**
- Consumes:
  - `WhatsAppService::verifySignature()`, `WhatsAppService::parseIncomingMessage()` from Task 3
  - `ProcessIncomingWhatsAppMessage::dispatch()` from Task 7
  - `config('whatsapp.simulation_mode')` from Task 2
- Produces:
  - `GET /api/v1/whatsapp/webhook` (webhook verification)
  - `POST /api/v1/whatsapp/webhook` (receive messages)

- [ ] **Step 1: Write failing test for webhook controller**

Create `tests/Feature/WhatsApp/WebhookTest.php`:

```php
<?php

namespace Tests\Feature\WhatsApp;

use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WebhookTest extends TestCase
{
    use RefreshDatabase;

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php artisan test --filter=WebhookTest
```

Expected: FAIL - route not found

- [ ] **Step 3: Create WhatsAppWebhookController**

```bash
php artisan make:controller Api/WhatsAppWebhookController
```

- [ ] **Step 4: Write WhatsAppWebhookController implementation**

Edit `app/Http/Controllers/Api/WhatsAppWebhookController.php`:

```php
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

    /**
     * Webhook verification (GET) - called by Meta during setup
     */
    public function verify(Request $request): Response
    {
        $mode = $request->query('hub.mode');
        $token = $request->query('hub.verify_token');
        $challenge = $request->query('hub.challenge');

        if ($mode === 'subscribe' && $token === config('whatsapp.meta.webhook_verify_token')) {
            return response($challenge, 200)->header('Content-Type', 'text/plain');
        }

        return response('Forbidden', 403);
    }

    /**
     * Webhook handler (POST) - receives incoming messages
     */
    public function handle(Request $request): JsonResponse
    {
        $payload = $request->all();
        $signature = $request->header('X-Hub-Signature-256', '');

        // Signature verification (bypass in simulation mode)
        if (!config('whatsapp.simulation_mode')) {
            if (!$this->whatsapp->verifySignature(json_encode($payload), $signature)) {
                Log::warning('WhatsApp webhook: invalid signature', [
                    'ip' => $request->ip(),
                ]);
                return response()->json(['message' => 'Invalid signature'], 400);
            }
        }

        // Parse incoming message
        $message = $this->whatsapp->parseIncomingMessage($payload);

        if (!$message) {
            // Not a text message (could be status update, media, etc.)
            return response()->json(['message' => 'ok'], 200);
        }

        // Dispatch async job for processing
        ProcessIncomingWhatsAppMessage::dispatch(
            $message['from'],
            $message['message'],
            $message['meta_message_id'] ?? null,
        );

        return response()->json(['message' => 'ok'], 200);
    }
}
```

- [ ] **Step 5: Add webhook routes**

Edit `routes/api.php`, add after the payment webhook routes:

```php
// WhatsApp Webhook (public, rate-limited, CSRF-exempt)
Route::get('whatsapp/webhook', [App\Http\Controllers\Api\WhatsAppWebhookController::class, 'verify']);
Route::post('whatsapp/webhook', [App\Http\Controllers\Api\WhatsAppWebhookController::class, 'handle'])
    ->middleware('throttle:60,1'); // Max 60 webhooks per minute
```

- [ ] **Step 6: Run test to verify it passes**

```bash
php artisan test --filter=WebhookTest
```

Expected: PASS all tests

- [ ] **Step 7: Commit webhook controller and routes**

```bash
git add app/Http/Controllers/Api/WhatsAppWebhookController.php routes/api.php tests/Feature/WhatsApp/
git commit -m "feat(whatsapp): add webhook controller with signature verification"
```

---

## Task 9: Chat Management Controller

**Files:**
- Create: `app/Http/Controllers/Api/WhatsAppChatController.php`
- Create: `app/Http/Controllers/Api/WhatsAppBookingController.php`

**Interfaces:**
- Consumes:
  - `WhatsAppChat::class`, `WhatsAppMessage::class`, `WhatsAppBooking::class` from Task 1
  - `SendWhatsAppMessage::dispatch()` from Task 7
  - `BookingService::approve()`, `BookingService::reject()` from Task 5
- Produces:
  - `GET /api/v1/whatsapp/chats` (list chats)
  - `GET /api/v1/whatsapp/chats/{id}` (detail with messages)
  - `POST /api/v1/whatsapp/chats/{id}/takeover` (admin takeover)
  - `POST /api/v1/whatsapp/chats/{id}/release` (release control)
  - `POST /api/v1/whatsapp/chats/{id}/send` (admin send message)
  - `POST /api/v1/whatsapp/bookings/{id}/approve`
  - `POST /api/v1/whatsapp/bookings/{id}/reject`

- [ ] **Step 1: Write failing test for chat management**

Create `tests/Feature/WhatsApp/ChatManagementTest.php`:

```php
<?php

namespace Tests\Feature\WhatsApp;

use App\Models\User;
use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ChatManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_chats(): void
    {
        $admin = User::factory()->admin()->create();
        WhatsAppChat::factory()->count(3)->create();

        $response = $this->actingAs($admin)->getJson('/api/v1/whatsapp/chats');

        $response->assertOk();
        $response->assertJsonCount(3, 'data');
    }

    public function test_cashier_cannot_access_chats(): void
    {
        $cashier = User::factory()->cashier()->create();

        $response = $this->actingAs($cashier)->getJson('/api/v1/whatsapp/chats');

        $response->assertStatus(403);
    }

    public function test_admin_can_view_chat_detail_with_messages(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create();
        WhatsAppMessage::factory()->count(5)->create(['chat_id' => $chat->id]);

        $response = $this->actingAs($admin)->getJson("/api/v1/whatsapp/chats/{$chat->id}");

        $response->assertOk();
        $response->assertJsonCount(5, 'messages');
    }

    public function test_admin_can_takeover_bot_chat(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['bot_active' => true]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/takeover");

        $response->assertOk();
        
        $chat->refresh();
        $this->assertTrue($chat->admin_takeover);
        $this->assertFalse($chat->bot_active);
        
        $this->assertDatabaseHas('whatsapp_messages', [
            'chat_id' => $chat->id,
            'event_type' => 'admin_takeover',
        ]);
    }

    public function test_admin_can_release_chat(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['admin_takeover' => true]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/release");

        $response->assertOk();
        
        $chat->refresh();
        $this->assertFalse($chat->admin_takeover);
        $this->assertFalse($chat->bot_active);
    }

    public function test_admin_can_send_message(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        Queue::fake();

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/send", [
            'message' => 'Hello from admin',
        ]);

        $response->assertOk();
        Queue::assertPushed(\App\Jobs\WhatsApp\SendWhatsAppMessage::class, function ($job) {
            return $job->phoneNumber === '628123456789';
        });
    }

    public function test_send_message_validates_message_field(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create();

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/chats/{$chat->id}/send", [
            'message' => '', // Empty
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('message');
    }

    public function test_chats_can_be_filtered_by_status(): void
    {
        $admin = User::factory()->admin()->create();
        WhatsAppChat::factory()->create(['bot_active' => true]);
        WhatsAppChat::factory()->create(['admin_takeover' => true]);
        WhatsAppChat::factory()->create(['bot_active' => false, 'admin_takeover' => false]);

        $response = $this->actingAs($admin)->getJson('/api/v1/whatsapp/chats?status=bot_active');
        $response->assertOk();
        $response->assertJsonCount(1, 'data');

        $response = $this->actingAs($admin)->getJson('/api/v1/whatsapp/chats?status=admin_takeover');
        $response->assertOk();
        $response->assertJsonCount(1, 'data');
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php artisan test --filter=ChatManagementTest
```

Expected: FAIL - route not found

- [ ] **Step 3: Create WhatsAppChatController**

```bash
php artisan make:controller Api/WhatsAppChatController
```

- [ ] **Step 4: Write WhatsAppChatController implementation**

Edit `app/Http/Controllers/Api/WhatsAppChatController.php`:

```php
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

        // Filter by status
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
```

- [ ] **Step 5: Add chat management routes**

Edit `routes/api.php`, add inside the `auth:sanctum` + `role:ADMIN` group:

```php
// WhatsApp Chat Management (Admin only)
Route::get('whatsapp/chats', [App\Http\Controllers\Api\WhatsAppChatController::class, 'index']);
Route::get('whatsapp/chats/{chat}', [App\Http\Controllers\Api\WhatsAppChatController::class, 'show']);
Route::post('whatsapp/chats/{chat}/takeover', [App\Http\Controllers\Api\WhatsAppChatController::class, 'takeover']);
Route::post('whatsapp/chats/{chat}/release', [App\Http\Controllers\Api\WhatsAppChatController::class, 'release']);
Route::post('whatsapp/chats/{chat}/send', [App\Http\Controllers\Api\WhatsAppChatController::class, 'sendMessage']);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
php artisan test --filter=ChatManagementTest
```

Expected: PASS all tests

- [ ] **Step 7: Write failing test for booking controller**

Create `tests/Feature/WhatsApp/BookingTest.php`:

```php
<?php

namespace Tests\Feature\WhatsApp;

use App\Models\Customer;
use App\Models\ServiceOrder;
use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_approve_booking(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create(['phone_number' => '628123456789']);
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'phone_number' => '628123456789',
            'customer_name' => 'John Doe',
            'tnkb' => 'B1234XYZ',
            'motorcycle_type' => 'Honda Vario',
            'status' => 'PENDING',
        ]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/approve");

        $response->assertOk();
        
        $booking->refresh();
        $this->assertEquals('APPROVED', $booking->status);
        $this->assertEquals($admin->id, $booking->approved_by);
        $this->assertNotNull($booking->service_order_id);

        $serviceOrder = ServiceOrder::find($booking->service_order_id);
        $this->assertNotNull($serviceOrder);
        $this->assertEquals('OPEN', $serviceOrder->status);
    }

    public function test_admin_can_reject_booking(): void
    {
        $admin = User::factory()->admin()->create();
        $chat = WhatsAppChat::factory()->create();
        $booking = WhatsAppBooking::factory()->create([
            'chat_id' => $chat->id,
            'status' => 'PENDING',
        ]);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/reject", [
            'reason' => 'Slot sudah penuh',
        ]);

        $response->assertOk();
        
        $booking->refresh();
        $this->assertEquals('REJECTED', $booking->status);
        $this->assertEquals('Slot sudah penuh', $booking->rejection_reason);
    }

    public function test_reject_requires_reason(): void
    {
        $admin = User::factory()->admin()->create();
        $booking = WhatsAppBooking::factory()->create(['status' => 'PENDING']);

        $response = $this->actingAs($admin)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/reject", [
            'reason' => '',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('reason');
    }

    public function test_cashier_cannot_approve_booking(): void
    {
        $cashier = User::factory()->cashier()->create();
        $booking = WhatsAppBooking::factory()->create(['status' => 'PENDING']);

        $response = $this->actingAs($cashier)->postJson("/api/v1/whatsapp/bookings/{$booking->id}/approve");

        $response->assertStatus(403);
    }
}
```

- [ ] **Step 8: Run test to verify it fails**

```bash
php artisan test --filter=BookingTest
```

Expected: FAIL - route not found

- [ ] **Step 9: Create WhatsAppBookingController**

```bash
php artisan make:controller Api/WhatsAppBookingController
```

- [ ] **Step 10: Write WhatsAppBookingController implementation**

Edit `app/Http/Controllers/Api/WhatsAppBookingController.php`:

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Services\WhatsApp\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WhatsAppBookingController extends Controller
{
    public function __construct(
        private BookingService $bookingService,
    ) {}

    public function approve(WhatsAppBooking $booking): JsonResponse
    {
        /** @var User $admin */
        $admin = Auth::user();

        $this->bookingService->approve($booking, $admin);

        return response()->json(['message' => 'Booking approved successfully']);
    }

    public function reject(Request $request, WhatsAppBooking $booking): JsonResponse
    {
        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        /** @var User $admin */
        $admin = Auth::user();

        $this->bookingService->reject($booking, $admin, $validated['reason']);

        return response()->json(['message' => 'Booking rejected']);
    }
}
```

- [ ] **Step 11: Add booking routes**

Edit `routes/api.php`, add inside the `auth:sanctum` + `role:ADMIN` group:

```php
// Booking Approval (Admin only)
Route::post('whatsapp/bookings/{booking}/approve', [App\Http\Controllers\Api\WhatsAppBookingController::class, 'approve']);
Route::post('whatsapp/bookings/{booking}/reject', [App\Http\Controllers\Api\WhatsAppBookingController::class, 'reject']);
```

- [ ] **Step 12: Run test to verify it passes**

```bash
php artisan test --filter=BookingTest
```

Expected: PASS all tests

- [ ] **Step 13: Commit controllers**

```bash
git add app/Http/Controllers/Api/WhatsApp*.php routes/api.php tests/Feature/WhatsApp/
git commit -m "feat(whatsapp): add chat management and booking controllers"
```

---

## Task 10: Broadcasting Events & Laravel Reverb Setup

**Files:**
- Create: `app/Events/WhatsApp/NewWhatsAppMessage.php`
- Create: `app/Events/WhatsApp/NewWhatsAppBooking.php`
- Modify: `.env.example` (Reverb config)

**Interfaces:**
- Consumes:
  - `WhatsAppMessage::class`, `WhatsAppBooking::class` from Task 1
  - Laravel Broadcasting
- Produces:
  - `broadcast(new NewWhatsAppMessage($message))`
  - `broadcast(new NewWhatsAppBooking($booking))`
  - Channel: `whatsapp-chats` (public channel)

- [ ] **Step 1: Install Laravel Reverb**

```bash
cd D:/PORTOFOLIO/BengkelMotor/backend
composer require laravel/reverb
```

Expected: Package installed successfully

- [ ] **Step 2: Publish Reverb config**

```bash
php artisan reverb:install
```

Expected: Config published, migrations created

- [ ] **Step 3: Run Reverb migrations**

```bash
php artisan migrate
```

Expected: Reverb tables created

- [ ] **Step 4: Update .env.example with Reverb config**

Already done in Task 2, verify it exists:

```bash
grep -A 7 "Laravel Broadcasting" .env.example
```

Expected: BROADCAST_CONNECTION, REVERB_* variables present

- [ ] **Step 5: Create NewWhatsAppMessage event**

```bash
php artisan make:event WhatsApp/NewWhatsAppMessage
```

- [ ] **Step 6: Write NewWhatsAppMessage implementation**

Edit `app/Events/WhatsApp/NewWhatsAppMessage.php`:

```php
<?php

namespace App\Events\WhatsApp;

use App\Models\WhatsAppMessage;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewWhatsAppMessage implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public WhatsAppMessage $message,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('whatsapp-chats');
    }

    public function broadcastWith(): array
    {
        return [
            'chat_id' => $this->message->chat_id,
            'message' => [
                'id' => $this->message->id,
                'direction' => $this->message->direction,
                'sender_type' => $this->message->sender_type,
                'message_text' => $this->message->message_text,
                'created_at' => $this->message->created_at->toIso8601String(),
            ],
        ];
    }
}
```

- [ ] **Step 7: Create NewWhatsAppBooking event**

```bash
php artisan make:event WhatsApp/NewWhatsAppBooking
```

- [ ] **Step 8: Write NewWhatsAppBooking implementation**

Edit `app/Events/WhatsApp/NewWhatsAppBooking.php`:

```php
<?php

namespace App\Events\WhatsApp;

use App\Models\WhatsAppBooking;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewWhatsAppBooking implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public WhatsAppBooking $booking,
    ) {}

    public function broadcastOn(): Channel
    {
        return new Channel('whatsapp-chats');
    }

    public function broadcastWith(): array
    {
        return [
            'booking' => [
                'id' => $this->booking->id,
                'customer_name' => $this->booking->customer_name,
                'phone_number' => $this->booking->phone_number,
                'booking_date' => $this->booking->booking_date->toDateString(),
                'booking_time' => $this->booking->booking_time,
                'status' => $this->booking->status,
            ],
        ];
    }
}
```

- [ ] **Step 9: Add broadcast calls to ProcessIncomingWhatsAppMessage**

Edit `app/Jobs/WhatsApp/ProcessIncomingWhatsAppMessage.php`, add after saving message:

```php
// After WhatsAppMessage::create() in step 3
$message = WhatsAppMessage::create([...]);

// Broadcast to admins
broadcast(new \App\Events\WhatsApp\NewWhatsAppMessage($message))->toOthers();
```

- [ ] **Step 10: Add broadcast calls to BookingService**

Edit `app/Services/WhatsApp/BookingService.php`, add at end of `createBooking()`:

```php
// Broadcast new booking
broadcast(new \App\Events\WhatsApp\NewWhatsAppBooking($booking))->toOthers();

return $booking;
```

- [ ] **Step 11: Test broadcasting config**

```bash
php artisan config:clear
php artisan about
```

Expected: Broadcasting shows "reverb" driver

- [ ] **Step 12: Commit broadcasting events**

```bash
git add app/Events/WhatsApp/ app/Jobs/WhatsApp/ProcessIncomingWhatsAppMessage.php app/Services/WhatsApp/BookingService.php
git commit -m "feat(whatsapp): add real-time broadcasting with Laravel Reverb"
```

---

## Task 11: Cleanup Command (Data Retention)

**Files:**
- Create: `app/Console/Commands/CleanupWhatsAppData.php`
- Modify: `routes/console.php` (schedule)

**Interfaces:**
- Consumes:
  - `WhatsAppChat::class`, `WhatsAppBooking::class` from Task 1
- Produces:
  - `php artisan whatsapp:cleanup` command

- [ ] **Step 1: Create CleanupWhatsAppData command**

```bash
php artisan make:command CleanupWhatsAppData
```

- [ ] **Step 2: Write CleanupWhatsAppData implementation**

Edit `app/Console/Commands/CleanupWhatsAppData.php`:

```php
<?php

namespace App\Console\Commands;

use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use Illuminate\Console\Command;

class CleanupWhatsAppData extends Command
{
    protected $signature = 'whatsapp:cleanup';
    protected $description = 'Cleanup old WhatsApp chat history (60 days) and bookings (365 days)';

    public function handle(): int
    {
        // Cleanup chat history older than 60 days
        // Exclude chats with active/pending bookings
        $deletedChats = WhatsAppChat::where('updated_at', '<', now()->subDays(60))
            ->whereDoesntHave('bookings', function ($q) {
                $q->whereIn('status', ['PENDING', 'APPROVED'])
                    ->where('booking_date', '>=', today());
            })
            ->delete();

        $this->info("Deleted {$deletedChats} old chat records (>60 days)");

        // Cleanup bookings older than 1 year
        // Only REJECTED or past APPROVED (completed > 30 days ago)
        $deletedBookings = WhatsAppBooking::where('created_at', '<', now()->subYear())
            ->where(function ($q) {
                $q->where('status', 'REJECTED')
                    ->orWhere(function ($q2) {
                        $q2->where('status', 'APPROVED')
                            ->where('booking_date', '<', now()->subDays(30));
                    });
            })
            ->delete();

        $this->info("Deleted {$deletedBookings} old booking records (>1 year)");

        return Command::SUCCESS;
    }
}
```

- [ ] **Step 3: Schedule cleanup command**

Edit `routes/console.php`, add:

```php
use Illuminate\Support\Facades\Schedule;

Schedule::command('whatsapp:cleanup')->daily();
```

- [ ] **Step 4: Test command manually**

```bash
php artisan whatsapp:cleanup
```

Expected: Output shows deleted count (likely 0 on first run)

- [ ] **Step 5: Commit cleanup command**

```bash
git add app/Console/Commands/CleanupWhatsAppData.php routes/console.php
git commit -m "feat(whatsapp): add data retention cleanup command"
```

---

## Task 12: Model Factories

**Files:**
- Create: `database/factories/WhatsAppChatFactory.php`
- Create: `database/factories/WhatsAppMessageFactory.php`
- Create: `database/factories/WhatsAppBookingFactory.php`

**Interfaces:**
- Consumes: Laravel Factory, Faker
- Produces: Factory classes for testing

- [ ] **Step 1: Create WhatsAppChatFactory**

```bash
php artisan make:factory WhatsAppChatFactory --model=WhatsAppChat
```

- [ ] **Step 2: Write WhatsAppChatFactory definition**

Edit `database/factories/WhatsAppChatFactory.php`:

```php
<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class WhatsAppChatFactory extends Factory
{
    public function definition(): array
    {
        return [
            'phone_number' => '628' . fake()->numerify('#########'),
            'last_message_at' => now()->subMinutes(rand(1, 60)),
            'last_message_from' => fake()->randomElement(['customer', 'admin', 'bot']),
            'bot_active' => false,
            'admin_takeover' => false,
        ];
    }

    public function botActive(): static
    {
        return $this->state(fn (array $attributes) => [
            'bot_active' => true,
        ]);
    }

    public function adminTakeover(): static
    {
        return $this->state(fn (array $attributes) => [
            'admin_takeover' => true,
            'bot_active' => false,
        ]);
    }
}
```

- [ ] **Step 3: Create WhatsAppMessageFactory**

```bash
php artisan make:factory WhatsAppMessageFactory --model=WhatsAppMessage
```

- [ ] **Step 4: Write WhatsAppMessageFactory definition**

Edit `database/factories/WhatsAppMessageFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\WhatsAppChat;
use Illuminate\Database\Eloquent\Factories\Factory;

class WhatsAppMessageFactory extends Factory
{
    public function definition(): array
    {
        return [
            'chat_id' => WhatsAppChat::factory(),
            'direction' => fake()->randomElement(['inbound', 'outbound']),
            'sender_type' => fake()->randomElement(['customer', 'admin', 'bot']),
            'message_text' => fake()->sentence(),
            'event_type' => null,
            'meta_message_id' => 'wamid.' . fake()->uuid(),
        ];
    }

    public function inbound(): static
    {
        return $this->state(fn (array $attributes) => [
            'direction' => 'inbound',
            'sender_type' => 'customer',
        ]);
    }

    public function outbound(): static
    {
        return $this->state(fn (array $attributes) => [
            'direction' => 'outbound',
            'sender_type' => fake()->randomElement(['admin', 'bot']),
        ]);
    }
}
```

- [ ] **Step 5: Create WhatsAppBookingFactory**

```bash
php artisan make:factory WhatsAppBookingFactory --model=WhatsAppBooking
```

- [ ] **Step 6: Write WhatsAppBookingFactory definition**

Edit `database/factories/WhatsAppBookingFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\WhatsAppChat;
use Illuminate\Database\Eloquent\Factories\Factory;

class WhatsAppBookingFactory extends Factory
{
    public function definition(): array
    {
        return [
            'chat_id' => WhatsAppChat::factory(),
            'customer_name' => fake()->name(),
            'phone_number' => '628' . fake()->numerify('#########'),
            'booking_date' => today()->addDays(rand(1, 7)),
            'booking_time' => fake()->time('H:i:s', '17:00'),
            'tnkb' => strtoupper(fake()->bothify('? #### ???')),
            'motorcycle_type' => fake()->randomElement(['Honda Vario 160', 'Yamaha Nmax', 'Suzuki Smash', 'Kawasaki Ninja']),
            'complaint' => fake()->sentence(),
            'status' => 'PENDING',
        ];
    }

    public function approved(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'APPROVED',
            'approved_at' => now(),
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'REJECTED',
            'approved_at' => now(),
            'rejection_reason' => fake()->sentence(),
        ]);
    }
}
```

- [ ] **Step 7: Test factories**

```bash
php artisan tinker
```

Run in tinker:
```php
\App\Models\WhatsAppChat::factory()->create();
\App\Models\WhatsAppMessage::factory()->inbound()->create();
\App\Models\WhatsAppBooking::factory()->approved()->create();
exit
```

Expected: All models created successfully

- [ ] **Step 8: Commit factories**

```bash
git add database/factories/WhatsApp*.php
git commit -m "feat(whatsapp): add model factories for testing"
```

---

## Task 13: Frontend - API Client & Types

**Files:**
- Create: `frontend/src/lib/api/whatsapp.ts`
- Create: `frontend/src/features/whatsapp/types.ts`
- Modify: `frontend/src/types/index.ts` (add WhatsApp types)

**Interfaces:**
- Consumes: `apiClient` from `lib/api/client.ts`
- Produces:
  - `getWhatsAppChatsApi(params?: { status?: string }): Promise<Paginated<WhatsAppChat>>`
  - `getWhatsAppChatDetailApi(chatId: number): Promise<WhatsAppChat>`
  - `takeoverChatApi(chatId: number): Promise<void>`
  - `releaseChatApi(chatId: number): Promise<void>`
  - `sendWhatsAppMessageApi(chatId: number, message: string): Promise<void>`
  - `approveBookingApi(bookingId: number): Promise<void>`
  - `rejectBookingApi(bookingId: number, reason: string): Promise<void>`

- [ ] **Step 1: Create WhatsApp types**

Create `frontend/src/features/whatsapp/types.ts`:

```typescript
export interface WhatsAppChat {
  id: number;
  phone_number: string;
  last_message_at: string;
  last_message_from: 'customer' | 'admin' | 'bot';
  bot_active: boolean;
  admin_takeover: boolean;
  latest_message?: {
    message_text: string;
    created_at: string;
  };
  messages?: WhatsAppMessage[];
}

export interface WhatsAppMessage {
  id: number;
  chat_id: number;
  direction: 'inbound' | 'outbound';
  sender_type: 'customer' | 'admin' | 'bot';
  message_text: string | null;
  event_type: string | null;
  created_at: string;
}

export interface WhatsAppBooking {
  id: number;
  chat_id: number;
  customer_name: string;
  phone_number: string;
  booking_date: string;
  booking_time: string;
  tnkb: string;
  motorcycle_type: string;
  complaint: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by?: number;
  approved_at?: string;
  rejection_reason?: string;
  service_order_id?: number;
}
```

- [ ] **Step 2: Create WhatsApp API client**

Create `frontend/src/lib/api/whatsapp.ts`:

```typescript
import { apiClient } from './client';
import type { Paginated } from '@/types';
import type { WhatsAppChat } from '@/features/whatsapp/types';

export const getWhatsAppChatsApi = async (params?: { status?: string }) => {
  const { data } = await apiClient.get<Paginated<WhatsAppChat>>('/whatsapp/chats', { params });
  return data;
};

export const getWhatsAppChatDetailApi = async (chatId: number) => {
  const { data } = await apiClient.get<WhatsAppChat>(`/whatsapp/chats/${chatId}`);
  return data;
};

export const takeoverChatApi = async (chatId: number) => {
  const { data } = await apiClient.post(`/whatsapp/chats/${chatId}/takeover`);
  return data;
};

export const releaseChatApi = async (chatId: number) => {
  const { data } = await apiClient.post(`/whatsapp/chats/${chatId}/release`);
  return data;
};

export const sendWhatsAppMessageApi = async (chatId: number, message: string) => {
  const { data } = await apiClient.post(`/whatsapp/chats/${chatId}/send`, { message });
  return data;
};

export const approveBookingApi = async (bookingId: number) => {
  const { data } = await apiClient.post(`/whatsapp/bookings/${bookingId}/approve`);
  return data;
};

export const rejectBookingApi = async (bookingId: number, reason: string) => {
  const { data } = await apiClient.post(`/whatsapp/bookings/${bookingId}/reject`, { reason });
  return data;
};
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd D:/PORTOFOLIO/BengkelMotor/frontend
npx tsc -b
```

Expected: No errors

- [ ] **Step 4: Commit frontend types and API client**

```bash
git add frontend/src/lib/api/whatsapp.ts frontend/src/features/whatsapp/types.ts
git commit -m "feat(whatsapp): add frontend API client and TypeScript types"
```

---

## Task 14: Frontend UI Components (WhatsApp Chat Page)

**Files:**
- Create: `frontend/src/features/whatsapp/WhatsAppChatsPage.tsx`
- Create: `frontend/src/features/whatsapp/ChatList.tsx`
- Create: `frontend/src/features/whatsapp/ChatWindow.tsx`
- Create: `frontend/src/features/whatsapp/ChatStatusBadge.tsx`
- Create: `frontend/src/features/whatsapp/BookingApprovalModal.tsx`

**Interfaces:**
- Consumes:
  - WhatsApp API functions from Task 13
  - `WhatsAppChat`, `WhatsAppMessage`, `WhatsAppBooking` types from Task 13
- Produces:
  - `/whatsapp-chats` page component with 2-column layout (list + detail)
  - Real-time chat interface for admin

- [ ] **Step 1: Create ChatStatusBadge component**

Create `frontend/src/features/whatsapp/ChatStatusBadge.tsx`:

```typescript
import { Badge } from '@/components/ui/Badge';

interface ChatStatusBadgeProps {
  botActive: boolean;
  adminTakeover: boolean;
}

export function ChatStatusBadge({ botActive, adminTakeover }: ChatStatusBadgeProps) {
  if (adminTakeover) {
    return <Badge variant="info">Admin Takeover</Badge>;
  }
  
  if (botActive) {
    return <Badge variant="success">Bot Aktif</Badge>;
  }
  
  return <Badge variant="secondary">Menunggu</Badge>;
}
```

- [ ] **Step 2: Create ChatList component**

Create `frontend/src/features/whatsapp/ChatList.tsx`:

```typescript
import { useState } from 'react';
import { ChatStatusBadge } from './ChatStatusBadge';
import { Card } from '@/components/ui/Card';
import { formatDistanceToNow } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { WhatsAppChat } from './types';

interface ChatListProps {
  chats: WhatsAppChat[];
  selectedChatId: number | null;
  onSelectChat: (chatId: number) => void;
}

export function ChatList({ chats, selectedChatId, onSelectChat }: ChatListProps) {
  return (
    <div className="space-y-2">
      {chats.map((chat) => (
        <Card
          key={chat.id}
          className={`p-4 cursor-pointer hover:border-primary transition-colors ${
            selectedChatId === chat.id ? 'border-primary bg-surface-2' : ''
          }`}
          onClick={() => onSelectChat(chat.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">
                {chat.phone_number}
              </p>
              {chat.latest_message && (
                <p className="text-sm text-muted-foreground truncate mt-1">
                  {chat.latest_message.message_text}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 ml-3">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(chat.last_message_at), {
                  addSuffix: true,
                  locale: localeId,
                })}
              </span>
              <ChatStatusBadge
                botActive={chat.bot_active}
                adminTakeover={chat.admin_takeover}
              />
            </div>
          </div>
        </Card>
      ))}
      
      {chats.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Belum ada chat</p>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create ChatWindow component**

Create `frontend/src/features/whatsapp/ChatWindow.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ChatStatusBadge } from './ChatStatusBadge';
import { format } from 'date-fns';
import { Send, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { WhatsAppChat, WhatsAppMessage } from './types';
import {
  takeoverChatApi,
  releaseChatApi,
  sendWhatsAppMessageApi,
} from '@/lib/api/whatsapp';

interface ChatWindowProps {
  chat: WhatsAppChat;
  onUpdate: () => void;
}

export function ChatWindow({ chat, onUpdate }: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages]);

  const handleTakeover = async () => {
    try {
      await takeoverChatApi(chat.id);
      toast.success('Chat berhasil diambil alih');
      onUpdate();
    } catch (error) {
      toast.error('Gagal mengambil alih chat');
    }
  };

  const handleRelease = async () => {
    try {
      await releaseChatApi(chat.id);
      toast.success('Chat berhasil dilepas');
      onUpdate();
    } catch (error) {
      toast.error('Gagal melepas chat');
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    setSending(true);
    try {
      await sendWhatsAppMessageApi(chat.id, message.trim());
      setMessage('');
      toast.success('Pesan dikirim');
      onUpdate();
    } catch (error) {
      toast.error('Gagal mengirim pesan');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">{chat.phone_number}</h3>
            <div className="flex items-center gap-2 mt-1">
              <ChatStatusBadge
                botActive={chat.bot_active}
                adminTakeover={chat.admin_takeover}
              />
            </div>
          </div>
          <div className="flex gap-2">
            {!chat.admin_takeover ? (
              <Button size="sm" onClick={handleTakeover}>
                <UserCheck className="w-4 h-4 mr-2" />
                Ambil Alih
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleRelease}>
                <UserX className="w-4 h-4 mr-2" />
                Lepas Kontrol
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chat.messages?.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender_type === 'customer' ? 'justify-start' : 'justify-end'
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.sender_type === 'customer'
                  ? 'bg-surface-2 text-foreground'
                  : msg.sender_type === 'bot'
                  ? 'bg-success/10 text-success-foreground'
                  : 'bg-primary text-primary-foreground'
              }`}
            >
              {msg.event_type ? (
                <p className="text-xs italic opacity-75">
                  {msg.event_type === 'bot_activated' && '🤖 Bot diaktifkan'}
                  {msg.event_type === 'admin_takeover' && '👤 Admin mengambil alih'}
                  {msg.event_type === 'bot_greeting' && '👋 Bot greeting'}
                </p>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {format(new Date(msg.created_at), 'HH:mm')}
                    {msg.sender_type === 'bot' && ' • Bot'}
                    {msg.sender_type === 'admin' && ' • Admin'}
                  </p>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-surface-2">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ketik pesan..."
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create BookingApprovalModal component**

Create `frontend/src/features/whatsapp/BookingApprovalModal.tsx`:

```typescript
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { approveBookingApi, rejectBookingApi } from '@/lib/api/whatsapp';
import type { WhatsAppBooking } from './types';

interface BookingApprovalModalProps {
  booking: WhatsAppBooking | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function BookingApprovalModal({
  booking,
  open,
  onClose,
  onUpdate,
}: BookingApprovalModalProps) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    if (!booking) return;

    setLoading(true);
    try {
      await approveBookingApi(booking.id);
      toast.success('Booking disetujui & service order dibuat');
      onUpdate();
      onClose();
    } catch (error) {
      toast.error('Gagal menyetujui booking');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!booking || !rejectionReason.trim()) {
      toast.error('Alasan penolakan wajib diisi');
      return;
    }

    setLoading(true);
    try {
      await rejectBookingApi(booking.id, rejectionReason.trim());
      toast.success('Booking ditolak');
      onUpdate();
      onClose();
      setRejecting(false);
      setRejectionReason('');
    } catch (error) {
      toast.error('Gagal menolak booking');
    } finally {
      setLoading(false);
    }
  };

  if (!booking) return null;

  return (
    <Modal open={open} onClose={onClose} title="Detail Booking">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Nama</p>
            <p className="font-medium">{booking.customer_name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">No. WhatsApp</p>
            <p className="font-medium">{booking.phone_number}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Tanggal</p>
            <p className="font-medium">
              {format(new Date(booking.booking_date), 'dd/MM/yyyy')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Waktu</p>
            <p className="font-medium">{booking.booking_time}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">TNKB</p>
            <p className="font-medium">{booking.tnkb}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Tipe Motor</p>
            <p className="font-medium">{booking.motorcycle_type}</p>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Keluhan</p>
          <p className="font-medium">{booking.complaint}</p>
        </div>

        {booking.status === 'PENDING' && !rejecting && (
          <div className="flex gap-2 pt-4">
            <Button onClick={handleApprove} disabled={loading} className="flex-1">
              Setujui Booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => setRejecting(true)}
              disabled={loading}
              className="flex-1"
            >
              Tolak
            </Button>
          </div>
        )}

        {rejecting && (
          <div className="space-y-3 pt-4">
            <Input
              label="Alasan Penolakan"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Misal: Slot penuh, tanggal tidak tersedia..."
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className="flex-1"
              >
                Konfirmasi Tolak
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRejecting(false);
                  setRejectionReason('');
                }}
                disabled={loading}
                className="flex-1"
              >
                Batal
              </Button>
            </div>
          </div>
        )}

        {booking.status === 'APPROVED' && (
          <div className="bg-success/10 p-3 rounded-lg">
            <p className="text-sm text-success-foreground">
              ✅ Booking sudah disetujui
            </p>
          </div>
        )}

        {booking.status === 'REJECTED' && (
          <div className="bg-destructive/10 p-3 rounded-lg">
            <p className="text-sm text-destructive-foreground">
              ❌ Booking ditolak: {booking.rejection_reason}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 5: Create WhatsAppChatsPage**

Create `frontend/src/features/whatsapp/WhatsAppChatsPage.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { BookingApprovalModal } from './BookingApprovalModal';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { RefreshCw } from 'lucide-react';
import { getWhatsAppChatsApi, getWhatsAppChatDetailApi } from '@/lib/api/whatsapp';
import { toast } from 'sonner';
import type { WhatsAppChat, WhatsAppBooking } from './types';

export function WhatsAppChatsPage() {
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<WhatsAppChat | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<WhatsAppBooking | null>(null);

  const fetchChats = async () => {
    try {
      const data = await getWhatsAppChatsApi({ status: statusFilter || undefined });
      setChats(data.data);
    } catch (error) {
      toast.error('Gagal memuat daftar chat');
    } finally {
      setLoading(false);
    }
  };

  const fetchChatDetail = async (chatId: number) => {
    try {
      const data = await getWhatsAppChatDetailApi(chatId);
      setSelectedChat(data);
    } catch (error) {
      toast.error('Gagal memuat detail chat');
    }
  };

  useEffect(() => {
    fetchChats();
  }, [statusFilter]);

  const handleSelectChat = (chatId: number) => {
    fetchChatDetail(chatId);
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchChats();
    if (selectedChat) {
      fetchChatDetail(selectedChat.id);
    }
  };

  return (
    <div className="h-[calc(100vh-120px)]">
      {/* Filter Bar */}
      <div className="flex items-center justify-between mb-4">
        <Select
          label=""
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-48"
        >
          <option value="">Semua Chat</option>
          <option value="bot_active">Bot Aktif</option>
          <option value="admin_takeover">Admin Takeover</option>
        </Select>
        <Button onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100%-60px)]">
        {/* Left: Chat List */}
        <div className="col-span-4 overflow-y-auto">
          <ChatList
            chats={chats}
            selectedChatId={selectedChat?.id || null}
            onSelectChat={handleSelectChat}
          />
        </div>

        {/* Right: Chat Window */}
        <div className="col-span-8">
          {selectedChat ? (
            <Card className="h-full flex flex-col">
              <ChatWindow chat={selectedChat} onUpdate={handleRefresh} />
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <p className="text-muted-foreground">
                Pilih chat untuk melihat percakapan
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Booking Approval Modal */}
      <BookingApprovalModal
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onUpdate={handleRefresh}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify TypeScript compilation**

```bash
cd D:/PORTOFOLIO/BengkelMotor/frontend
npx tsc -b
```

Expected: No errors

- [ ] **Step 7: Commit frontend UI components**

```bash
git add frontend/src/features/whatsapp/
git commit -m "feat(whatsapp): add frontend UI components for chat management"
```

---

## Task 15: Frontend WebSocket Integration

**Files:**
- Create: `frontend/src/lib/websocket.ts`
- Modify: `frontend/src/features/whatsapp/WhatsAppChatsPage.tsx` (add WebSocket listener)

**Interfaces:**
- Consumes:
  - Laravel Echo, Pusher
  - Reverb config from `.env`
- Produces:
  - `echo` instance for WebSocket connection
  - Real-time message updates

- [ ] **Step 1: Install frontend WebSocket dependencies**

```bash
cd D:/PORTOFOLIO/BengkelMotor/frontend
npm install --save laravel-echo pusher-js
```

Expected: Packages installed

- [ ] **Step 2: Create websocket.ts setup**

Create `frontend/src/lib/websocket.ts`:

```typescript
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher: typeof Pusher;
    Echo: Echo;
  }
}

window.Pusher = Pusher;

export const echo = new Echo({
  broadcaster: 'reverb',
  key: import.meta.env.VITE_REVERB_APP_KEY,
  wsHost: import.meta.env.VITE_REVERB_HOST,
  wsPort: import.meta.env.VITE_REVERB_PORT ? parseInt(import.meta.env.VITE_REVERB_PORT) : 80,
  wssPort: import.meta.env.VITE_REVERB_PORT ? parseInt(import.meta.env.VITE_REVERB_PORT) : 443,
  forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
  enabledTransports: ['ws', 'wss'],
  disableStats: true,
});

window.Echo = echo;
```

- [ ] **Step 3: Add Reverb env variables to frontend .env**

Create `frontend/.env.example` (if not exists) or append:

```env
VITE_REVERB_APP_KEY=
VITE_REVERB_HOST=localhost
VITE_REVERB_PORT=8080
VITE_REVERB_SCHEME=http
```

- [ ] **Step 4: Update WhatsAppChatsPage with WebSocket listener**

Edit `frontend/src/features/whatsapp/WhatsAppChatsPage.tsx`, add imports:

```typescript
import { echo } from '@/lib/websocket';
```

Add useEffect for WebSocket in component:

```typescript
// Add after existing useEffect
useEffect(() => {
  // Subscribe to WhatsApp channel
  echo.channel('whatsapp-chats')
    .listen('.App\\Events\\WhatsApp\\NewWhatsAppMessage', (data: any) => {
      // Update selected chat if it matches
      if (selectedChat && data.chat_id === selectedChat.id) {
        fetchChatDetail(selectedChat.id);
      }
      
      // Play notification sound
      const audio = new Audio('/notification.mp3');
      audio.play().catch(() => {
        // Silent fail if audio not available
      });
      
      toast.info('Pesan baru diterima');
    })
    .listen('.App\\Events\\WhatsApp\\NewWhatsAppBooking', (data: any) => {
      toast.success(`Booking baru dari ${data.booking.customer_name}`);
      fetchChats(); // Refresh chat list
    });

  return () => {
    echo.leaveChannel('whatsapp-chats');
  };
}, [selectedChat?.id]);
```

- [ ] **Step 5: Verify TypeScript compilation**

```bash
cd D:/PORTOFOLIO/BengkelMotor/frontend
npx tsc -b
```

Expected: No errors

- [ ] **Step 6: Commit WebSocket integration**

```bash
git add frontend/src/lib/websocket.ts frontend/src/features/whatsapp/WhatsAppChatsPage.tsx frontend/.env.example
git commit -m "feat(whatsapp): add WebSocket integration for real-time updates"
```

---

## Task 16: Frontend Router & Navigation

**Files:**
- Modify: `frontend/src/App.tsx` (add route)
- Modify: `frontend/src/layouts/AppShell.tsx` (sidebar menu)

**Interfaces:**
- Consumes: `WhatsAppChatsPage` from Task 14
- Produces: `/whatsapp-chats` route accessible by Admin

- [ ] **Step 1: Add WhatsApp route**

Edit `frontend/src/App.tsx`, add import:

```typescript
import { WhatsAppChatsPage } from '@/features/whatsapp/WhatsAppChatsPage';
```

Add route inside admin-protected section:

```typescript
<Route path="/whatsapp-chats" element={<WhatsAppChatsPage />} />
```

- [ ] **Step 2: Update AppShell navigation**

Edit `frontend/src/layouts/AppShell.tsx`, add import:

```typescript
import { MessageCircle } from 'lucide-react';
```

Add to `NAV_ITEMS` array (before Reports or after Service Orders):

```typescript
{
  label: 'Chat WhatsApp',
  icon: MessageCircle,
  path: '/whatsapp-chats',
  roles: ['ADMIN'],
},
```

Add to `PAGE_META`:

```typescript
'/whatsapp-chats': {
  title: 'Chat WhatsApp',
  description: 'Kelola percakapan & booking pelanggan',
},
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd D:/PORTOFOLIO/BengkelMotor/frontend
npx tsc -b
```

Expected: No errors

- [ ] **Step 4: Test frontend build**

```bash
npm run build
```

Expected: Build succeeds (may have chunk size warnings, acceptable for now)

- [ ] **Step 5: Commit frontend routing**

```bash
git add frontend/src/App.tsx frontend/src/layouts/AppShell.tsx
git commit -m "feat(whatsapp): add navigation and routing for chat page"
```

---

## Task 17: Design Specification Document

**Files:**
- Create: `docs/superpowers/specs/2026-09-05-whatsapp-chatbot-design.md`

**Interfaces:**
- Consumes: All design decisions from brainstorming phase
- Produces: Comprehensive design specification document

- [ ] **Step 1: Create design spec document**

Create `docs/superpowers/specs/2026-09-05-whatsapp-chatbot-design.md`:

```markdown
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
```

- [ ] **Step 2: Commit design specification**

```bash
git add docs/superpowers/specs/2026-09-05-whatsapp-chatbot-design.md
git commit -m "docs(whatsapp): add comprehensive design specification"
```

---

## Task 18: Final Integration Testing & Verification

**Files:**
- No new files (testing existing implementation)

**Interfaces:**
- Consumes: All implemented features
- Produces: Verified working system

- [ ] **Step 1: Run all backend tests**

```bash
cd D:/PORTOFOLIO/BengkelMotor/backend
php artisan test
```

Expected: All tests PASS (existing + new WhatsApp tests)

- [ ] **Step 2: Check database migrations status**

```bash
php artisan migrate:status
```

Expected: All 4 new WhatsApp migrations show "Ran"

- [ ] **Step 3: Verify queue configuration**

```bash
php artisan queue:work --once
```

Expected: No errors, processes 0 jobs (since queue is empty)

- [ ] **Step 4: Test webhook verification endpoint**

```bash
curl "http://localhost:8000/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test_token&hub.challenge=test123"
```

Expected: Returns "test123" (after setting WHATSAPP_WEBHOOK_VERIFY_TOKEN=test_token in .env)

- [ ] **Step 5: Verify frontend builds successfully**

```bash
cd D:/PORTOFOLIO/BengkelMotor/frontend
npm run build
```

Expected: Build succeeds with `dist/` folder created

- [ ] **Step 6: Check TypeScript compilation**

```bash
npx tsc -b
```

Expected: No errors

- [ ] **Step 7: Verify all routes are registered**

```bash
cd D:/PORTOFOLIO/BengkelMotor/backend
php artisan route:list --path=whatsapp
```

Expected: Shows all WhatsApp routes (webhook, chats, bookings)

- [ ] **Step 8: Test simulation mode**

Create test `.env` entry:
```env
WHATSAPP_SIMULATION_MODE=true
WHATSAPP_WEBHOOK_VERIFY_TOKEN=test_token
```

Restart services and verify logs when webhook is called

- [ ] **Step 9: Create manual test checklist document**

Create `docs/superpowers/specs/2026-09-05-whatsapp-chatbot-manual-testing.md`:

```markdown
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
```

- [ ] **Step 10: Commit testing documentation**

```bash
git add docs/superpowers/specs/2026-09-05-whatsapp-chatbot-manual-testing.md
git commit -m "docs(whatsapp): add manual testing checklist"
```

- [ ] **Step 11: Final verification commit**

```bash
git log --oneline -10
```

Expected: Shows all WhatsApp feature commits

- [ ] **Step 12: Tag implementation milestone**

```bash
git tag -a whatsapp-chatbot-v1.0 -m "WhatsApp Chatbot Auto-Fallback feature complete"
git push origin whatsapp-chatbot-v1.0
```

---

## Plan Self-Review

### Spec Coverage Check

✅ **Database schema:** 3 tables (chats, messages, bookings) - COVERED (Task 1)  
✅ **Configuration:** whatsapp.php + .env variables - COVERED (Task 2)  
✅ **WhatsApp Service:** Send, verify, parse - COVERED (Task 3)  
✅ **Gemini AI Service:** Process, fallback, cache - COVERED (Task 4)  
✅ **Booking Service:** Validate, create, approve, reject - COVERED (Task 5)  
✅ **Bot Conversation:** Orchestration - COVERED (Task 6)  
✅ **Queue Jobs:** 3 jobs (activate, process, send) - COVERED (Task 7)  
✅ **Controllers:** Webhook, ChatManagement, Booking - COVERED (Tasks 8, 9)  
✅ **Broadcasting:** Laravel Reverb + events - COVERED (Task 10)  
✅ **Cleanup:** Data retention command - COVERED (Task 11)  
✅ **Factories:** Testing support - COVERED (Task 12)  
✅ **Frontend:** API client, types, UI components - COVERED (Tasks 13, 14)  
✅ **WebSocket:** Real-time integration - COVERED (Task 15)  
✅ **Navigation:** Routing + sidebar - COVERED (Task 16)  
✅ **Documentation:** Design spec + testing - COVERED (Tasks 17, 18)  

### Placeholder Scan

❌ No TBD/TODO found  
❌ No "implement later" found  
❌ No vague "add validation" without code  
❌ No "similar to Task N" without showing code  
✅ All code blocks contain actual implementation  
✅ All interfaces clearly defined with exact signatures  

### Type Consistency Check

✅ `WhatsAppChat::class` used consistently across all tasks  
✅ `WhatsAppMessage::class` used consistently  
✅ `WhatsAppBooking::class` used consistently  
✅ Service method signatures match between tasks (e.g., `sendMessage()` signature same in Task 3 and Task 7)  
✅ API client functions match controller endpoints (Task 13 client matches Task 9 routes)  
✅ Frontend types match backend model structure  

### Missing Requirements

None - all spec requirements have corresponding tasks.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-05-whatsapp-chatbot-auto-fallback.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
