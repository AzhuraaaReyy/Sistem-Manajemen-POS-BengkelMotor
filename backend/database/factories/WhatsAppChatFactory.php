<?php

namespace Database\Factories;

use App\Models\WhatsAppChat;
use Illuminate\Database\Eloquent\Factories\Factory;

class WhatsAppChatFactory extends Factory
{
    protected $model = WhatsAppChat::class;

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
