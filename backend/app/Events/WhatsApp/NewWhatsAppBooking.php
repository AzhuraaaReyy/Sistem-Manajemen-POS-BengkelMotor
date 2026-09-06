<?php

namespace App\Events\WhatsApp;

use App\Models\WhatsAppBooking;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewWhatsAppBooking implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public WhatsAppBooking $booking,
    ) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel('whatsapp-chats');
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
