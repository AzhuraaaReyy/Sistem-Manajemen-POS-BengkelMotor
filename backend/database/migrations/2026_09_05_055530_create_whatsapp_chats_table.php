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
