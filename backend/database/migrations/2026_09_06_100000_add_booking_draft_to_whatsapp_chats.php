<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_chats', function (Blueprint $table) {
            $table->json('booking_draft')->nullable()->after('admin_takeover');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_chats', function (Blueprint $table) {
            $table->dropColumn('booking_draft');
        });
    }
};