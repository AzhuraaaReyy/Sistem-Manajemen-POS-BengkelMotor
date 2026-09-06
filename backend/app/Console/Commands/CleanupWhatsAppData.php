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
        $deletedChats = WhatsAppChat::where('updated_at', '<', now()->subDays(60))
            ->whereDoesntHave('bookings', function ($q) {
                $q->whereIn('status', ['PENDING', 'APPROVED'])
                    ->where('booking_date', '>=', today());
            })
            ->delete();

        $this->info("Deleted {$deletedChats} old chat records (>60 days)");

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
