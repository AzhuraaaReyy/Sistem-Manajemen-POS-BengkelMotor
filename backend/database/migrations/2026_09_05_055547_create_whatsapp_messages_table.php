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
