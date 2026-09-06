<?php

namespace Database\Factories;

use App\Models\WhatsAppChat;
use App\Models\WhatsAppMessage;
use Illuminate\Database\Eloquent\Factories\Factory;

class WhatsAppMessageFactory extends Factory
{
    protected $model = WhatsAppMessage::class;

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
