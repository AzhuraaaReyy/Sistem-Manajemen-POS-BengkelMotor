<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_bookings', function (Blueprint $table) {
            $table->foreignId('service_order_id')->nullable()->after('rejection_reason')->constrained()->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_bookings', function (Blueprint $table) {
            $table->dropForeign(['service_order_id']);
            $table->dropColumn('service_order_id');
        });
    }
};
