<?php

namespace Database\Factories;

use App\Models\WhatsAppBooking;
use App\Models\WhatsAppChat;
use Illuminate\Database\Eloquent\Factories\Factory;

class WhatsAppBookingFactory extends Factory
{
    protected $model = WhatsAppBooking::class;

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
