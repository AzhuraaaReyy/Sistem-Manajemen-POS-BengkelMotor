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

        if ($date->isSunday()) {
            throw ValidationException::withMessages([
                'booking_date' => 'Maaf, kami libur di hari Minggu.',
            ]);
        }

        if ($date->isSameDay(today())) {
            throw ValidationException::withMessages([
                'booking_date' => 'Booking minimal H-1. Silakan pilih tanggal besok atau setelahnya.',
            ]);
        }

        $openTime = Carbon::parse(config('whatsapp.operational.hours.open'));
        $closeTime = Carbon::parse(config('whatsapp.operational.hours.close'));
        
        if ($time->lt($openTime) || $time->gt($closeTime)) {
            throw ValidationException::withMessages([
                'booking_time' => 'Jam booking harus antara 08:00 - 17:00 WIB.',
            ]);
        }

        if (!$this->isSlotAvailable($date)) {
            throw ValidationException::withMessages([
                'booking_date' => 'Maaf, slot booking untuk tanggal tersebut sudah penuh. Silakan pilih tanggal lain.',
            ]);
        }

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

        broadcast(new \App\Events\WhatsApp\NewWhatsAppBooking($booking))->toOthers();

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
            $booking->update([
                'status' => 'APPROVED',
                'approved_by' => $admin->id,
                'approved_at' => now(),
            ]);

            $customerId = $this->getOrCreateCustomer($booking);

            $serviceOrder = ServiceOrder::create([
                'order_code' => 'SO-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6)),
                'customer_id' => $customerId,
                'motorcycle_type' => $booking->motorcycle_type,
                'cashier_id' => $admin->id,
                'mechanic_id' => null,
                'complaint' => $booking->complaint,
                'diagnosis_note' => "Auto-created dari booking WhatsApp (ID: {$booking->id})",
                'status' => 'OPEN',
                'opened_at' => Carbon::parse($booking->booking_date->format('Y-m-d') . ' ' . $booking->booking_time),
            ]);

            $booking->update(['service_order_id' => $serviceOrder->id]);

            $this->whatsappService->sendMessage(
                $booking->phone_number,
                "✅ *Booking Anda Disetujui!*\n\n" .
                "Kode Order: {$serviceOrder->order_code}\n" .
                "Tanggal: " . Carbon::parse($booking->booking_date)->isoFormat('dddd, D MMMM YYYY') . "\n" .
                "Jam: {$booking->booking_time}\n" .
                "Motor: {$booking->motorcycle_type} ({$booking->tnkb})\n\n" .
                "Silakan datang sesuai jadwal. Terima kasih! 🙏"
            );

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
