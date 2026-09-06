<?php

// Smoke-test fitur WhatsApp chatbot dalam simulation mode.
// Menjalankan SELURUH skenario produksi (job -> service -> DB) dan
// melaporkan PASS/FAIL per skenario.
//
// Run dengan: php artisan tinker --execute="require 'scripts/whatsapp-smoke-test.php';"
//
// Catatan:
// - Memaksa simulation_mode + queue sync + broadcast null + Gemini mati,
//   sehingga deterministik dan tanpa server/worker/jaringan.
// - Nomor uji unik acak, dibersihkan otomatis di akhir (kecuali env
//   KEEP_TEST_DATA=1).

use App\Jobs\WhatsApp\ActivateBotIfNoAdminReply;
use App\Jobs\WhatsApp\ProcessIncomingWhatsAppMessage;
use App\Models\Notification;
use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use App\Services\WhatsApp\BookingService;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

// --- Konfigurasi runtime (deterministik, tanpa dependensi eksternal) ---
config(['whatsapp.simulation_mode' => true]);
config(['queue.default' => 'sync']);                 // job jalan inline
config(['broadcasting.default' => 'null']);          // tanpa Reverb
config(['whatsapp.gemini.api_url' => 'http://127.0.0.1:1']);
config(['whatsapp.gemini.api_key' => 'smoke-test']); // dipaksa gagal -> fallback

$state = ['results' => [], 'failures' => 0];

$check = function (string $label, bool $ok, string $detail = '') use (&$state): void {
    $state['results'][] = $label;
    $status = $ok ? '[PASS]' : '[FAIL]';
    if (!$ok) {
        $state['failures']++;
    }
    echo "$status $label" . ($detail !== '' ? "  ($detail)" : '') . PHP_EOL;
};

function uniqueTestPhone(string $prefix): string
{
    do {
        $candidate = $prefix . mt_rand(10000000, 99999999);
    } while (WhatsAppChat::where('phone_number', $candidate)->exists());

    return $candidate;
}

function workingDate(int $offsetDays): string
{
    $d = today()->addDays($offsetDays);
    while ($d->isSunday()) {
        $d->addDay();
    }

    return $d->toDateString();
}

function nextSunday(): string
{
    $d = today();
    while (!$d->isSunday()) {
        $d->addDay();
    }

    return $d->toDateString();
}

// --- Persiapan nomor uji ---
$phone = uniqueTestPhone('6289');
$chatIds = [];
$bookingIds = [];
$scenarioError = null;

try {
    echo "=== WhatsApp chatbot SMOKE-TEST (simulation) ===\n";
    echo "Nomor uji: $phone\n\n";

    // ---------- S1: Chat baru (dormant) ----------
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'Halo, ada yang bisa bantu?', 'wamid.s1.1');

    $chat = WhatsAppChat::where('phone_number', $phone)->first();
    $chatIds[] = $chat->id;

    $check('S1 chat dibuat (dormant)', $chat && $chat->bot_active === false && $chat->admin_takeover === false);
    $inbound = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'inbound')->count();
    $check('S1 pesan inbound tersimpan 1x', $inbound === 1, "inbound=$inbound");
    $outbound = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'outbound')->count();
    $check('S1 belum ada balasan bot (dormant)', $outbound === 0, "outbound=$outbound");

    // ---------- S2: Aktivasi otomatis (>= 5 menit tanpa balasan) ----------
    $chat->update(['last_message_at' => now()->subMinutes(6)]);
    ActivateBotIfNoAdminReply::dispatch($chat->id);

    $chat->refresh();
    $check('S2 bot aktif setelah jeda >= 5 menit', $chat->bot_active === true);
    $hasActivation = WhatsAppMessage::where('chat_id', $chat->id)
        ->where('event_type', 'bot_activated')->exists();
    $hasGreeting = WhatsAppMessage::where('chat_id', $chat->id)
        ->where('event_type', 'bot_greeting')->exists();
    $check('S2 event aktvasi + sapaan tercatat', $hasActivation && $hasGreeting);

    // ---------- S3: Alur booking penuh (draft persist antar instance) ----------
    $inboundBefore = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'inbound')->count();
    $outboundBefore = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'outbound')->count();
    $date = workingDate(2);

    $steps = ['booking', 'Budi Santoso', 'B 1234 ABC', 'Honda Vario 125', 'Ganti oli', $date, '10:30'];
    foreach ($steps as $i => $msg) {
        ProcessIncomingWhatsAppMessage::dispatch($phone, $msg, "wamid.s3.$i");
    }

    $inboundAfter = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'inbound')->count();
    $outboundAfter = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'outbound')->count();
    $check('S3 tepat 1 inbound/pesan (regresi duplikat)', $inboundAfter - $inboundBefore === count($steps), 'delta=' . ($inboundAfter - $inboundBefore));
    $check('S3 tepat 1 outbound/pesan', $outboundAfter - $outboundBefore === count($steps), 'delta=' . ($outboundAfter - $outboundBefore));

    $booking = WhatsAppBooking::where('chat_id', $chat->id)->latest('id')->first();
    $bookingIds[] = $booking?->id;
    $check('S3 booking dibuat (draft persist lintas job)', $booking !== null);
    $check('S3 data booking benar', $booking && $booking->status === 'PENDING'
        && $booking->customer_name === 'Budi Santoso'
        && $booking->tnkb === 'B1234ABC'
        && $booking->motorcycle_type === 'Honda Vario 125'
        && $booking->complaint === 'Ganti oli', $booking?->status . '/' . $booking?->tnkb);
    $chat->refresh();
    $check('S3 draft dikosongkan setelah selesai', $chat->booking_draft === null);

    // ---------- S4: Pembatalan alur booking ----------
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'booking', 'wamid.s4.0');
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'Budi X', 'wamid.s4.1');
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'batal', 'wamid.s4.2');

    $countAfterCancel = WhatsAppBooking::where('chat_id', $chat->id)->count();
    $chat->refresh();
    $check('S4 tidak ada booking baru setelah batal', $countAfterCancel === 1, "total=$countAfterCancel");
    $check('S4 draft null setelah batal', $chat->booking_draft === null);

    // ---------- S5: Pertanyaan umum -> fallback (Gemini mati) ----------
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'berapa harga oli?', 'wamid.s5.1');
    $lastOutbound = WhatsAppMessage::where('chat_id', $chat->id)
        ->where('direction', 'outbound')->latest('id')->value('message_text');
    $check('S5 fallback untuk pertanyaan umum', $lastOutbound !== null
        && str_contains($lastOutbound, 'Maaf, saya belum bisa menjawab'), 'reply=' . str_limit($lastOutbound ?? '', 40));

    // ---------- S6: Validasi penolakan ----------
    // 6a: tanggal lampau (bukan Minggu) via alur bot -> minimal H-1
    $pastDate = today()->subDays(2);
    while ($pastDate->isSunday()) {
        $pastDate->subDay();
    }
    $pastDate = $pastDate->toDateString();
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'booking', 'wamid.s6a.0');
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'Budi P', 'wamid.s6a.1');
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'B 9999 CD', 'wamid.s6a.2');
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'Honda PCX', 'wamid.s6a.3');
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'Servis rem', 'wamid.s6a.4');
    ProcessIncomingWhatsAppMessage::dispatch($phone, $pastDate, 'wamid.s6a.5');
    ProcessIncomingWhatsAppMessage::dispatch($phone, '10:00', 'wamid.s6a.6');
    $lastReply = WhatsAppMessage::where('chat_id', $chat->id)
        ->where('direction', 'outbound')->latest('id')->value('message_text');
    $bookingAfterPast = WhatsAppBooking::where('chat_id', $chat->id)->count();
    $check('S6a tanggal lampau ditolak (minimal H-1)', $bookingAfterPast === 1
        && str_contains($lastReply ?? '', 'minimal H-1'));

    // 6b: hari Minggu (direct service)
    $service = app(BookingService::class);
    try {
        $service->createBooking($chat->refresh(), [
            'customer_name' => 'X', 'tnkb' => 'B1', 'motorcycle_type' => 'M',
            'complaint' => 'C', 'booking_date' => nextSunday(), 'booking_time' => '10:00',
        ]);
        $check('S6b hari Minggu ditolak', false, 'TIDAK dilempar');
    } catch (ValidationException $e) {
        $msg = collect($e->errors())->flatten()->first();
        $check('S6b hari Minggu ditolak', str_contains($msg, 'libur di hari Minggu'), $msg);
    }

    // 6c: jam di luar operasional (direct service)
    try {
        $service->createBooking($chat->refresh(), [
            'customer_name' => 'X', 'tnkb' => 'B1', 'motorcycle_type' => 'M',
            'complaint' => 'C', 'booking_date' => workingDate(3), 'booking_time' => '19:00',
        ]);
        $check('S6c jam 19:00 ditolak', false, 'TIDAK dilempar');
    } catch (ValidationException $e) {
        $msg = collect($e->errors())->flatten()->first();
        $check('S6c jam 19:00 ditolak', str_contains($msg, '08:00 - 17:00'), $msg);
    }

    // 6d: slot penuh (direct service; isi 5 dulu)
    $fullDate = workingDate(4);
    for ($i = 0; $i < 5; $i++) {
        $b = WhatsAppBooking::create([
            'chat_id' => $chat->id,
            'customer_name' => "Filler $i",
            'phone_number' => $phone,
            'booking_date' => $fullDate,
            'booking_time' => '09:00',
            'tnkb' => 'BF1',
            'motorcycle_type' => 'M',
            'complaint' => 'C',
            'status' => 'PENDING',
        ]);
        $bookingIds[] = $b->id;
    }
    try {
        $service->createBooking($chat->refresh(), [
            'customer_name' => 'X', 'tnkb' => 'B1', 'motorcycle_type' => 'M',
            'complaint' => 'C', 'booking_date' => $fullDate, 'booking_time' => '10:00',
        ]);
        $check('S6d slot penuh ditolak', false, 'TIDAK dilempar');
    } catch (ValidationException $e) {
        $msg = collect($e->errors())->flatten()->first();
        $check('S6d slot penuh ditolak', str_contains($msg, 'slot'), $msg);
    }

    // ---------- S7: Idempotensi meta_message_id ----------
    $inboundBefore = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'inbound')->count();
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'duplikat pesan', 'wamid.s7.1');
    ProcessIncomingWhatsAppMessage::dispatch($phone, 'duplikat pesan LAGI', 'wamid.s7.1'); // ulang id
    $inboundAfter = WhatsAppMessage::where('chat_id', $chat->id)->where('direction', 'inbound')->count();
    $check('S7 meta_message_id duplikat dilewati', $inboundAfter - $inboundBefore === 1, 'delta=' . ($inboundAfter - $inboundBefore));

} catch (\Throwable $e) {
    $scenarioError = get_class($e) . ': ' . $e->getMessage();
    echo "[FAIL] EXCEPTION TAK TERDUGA: $scenarioError" . PHP_EOL;
    $state['failures']++;

} finally {
    // ---------- Cleanup ----------
    if (getenv('KEEP_TEST_DATA') !== '1') {
        if (!empty($bookingIds)) {
            WhatsAppBooking::whereIn('id', $bookingIds)->delete();
        }
        if (!empty($chatIds)) {
            WhatsAppMessage::whereIn('chat_id', $chatIds)->delete();
            WhatsAppChat::whereIn('id', $chatIds)->delete();
        }
        foreach ($bookingIds as $bid) {
            if ($bid) {
                try {
                    Notification::whereJsonContains('data->booking_id', $bid)->delete();
                } catch (\Throwable) {
                    Notification::where('data', 'like', "%\"booking_id\":$bid}%")->delete();
                }
            }
        }
        echo "\n[Cleanup] data uji dihapus (chat/messages/bookings/notifikasi).\n";
    } else {
        echo "\n[Skip cleanup] KEEP_TEST_DATA=1 — data uji dipertahankan ($phone).\n";
    }
}

// ---------- Ringkasan ----------
echo "\n=== RINGKASAN ===\n";
echo 'Total: ' . count($state['results']) . ' cek, ' . $state['failures'] . ' gagal' . ($scenarioError ? " | EXCEPTION: $scenarioError" : '') . PHP_EOL;

exit($state['failures'] > 0 ? 1 : 0);

function str_limit(?string $s, int $n): string
{
    $s = (string) $s;
    return strlen($s) > $n ? substr($s, 0, $n) . '…' : $s;
}



