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
