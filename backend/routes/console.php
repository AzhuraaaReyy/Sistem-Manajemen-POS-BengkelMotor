<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('expire:pending-sales')->everyMinute();
Schedule::command('notifications:cleanup')->daily();
// Sweep konvergen: produk yang sudah rendah/habus di luar jalur
// penjualan/Atur Stok tetap mendapat notifikasi tanpa menunggu
// perubahan stok berikutnya.
Schedule::command('notifications:sync-stock')->hourly();
Schedule::command('whatsapp:cleanup')->daily();
