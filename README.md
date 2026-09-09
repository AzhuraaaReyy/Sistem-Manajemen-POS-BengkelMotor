# Bengkel POS & Monitoring

Sistem **Point of Sale (POS) dan monitoring lengkap untuk bengkel motor** berbasis web. Dibangun sebagai monolitik SPA (React + TypeScript) dengan REST API (Laravel 12) dan database relasional.

Mencakup manajemen penjualan kasir, stok sparepart, servis, pengeluaran, laporan keuangan, pembayaran online (Midtrans), notifikasi real-time, serta chatbot WhatsApp untuk pemesanan servis.

---

## ✨ Fitur Utama

### 🛒 POS & Transaksi
- Kasir checkout produk & jasa dengan pemilihan pelanggan (walk-in)
- Pembayaran **tunai (CASH)** dan **online QRIS / Virtual Account (Midtrans)**
- **Fallback otomatis**: saat payment gateway gangguan (jaringan putus / error 5xx), backend mengembalikan `503 PAYMENT_GATEWAY_UNAVAILABLE` dan frontend menyarankan beralih ke tunai tanpa kehilangan transaksi (stok & charge di-rollback)
- Diskon, hitung kembalian, dan cetak struk thermal
- **Void / pembatalan transaksi** dengan alasan (Admin/Kasir sesuai izin)

### 📦 Inventori & Stok
- Manajemen produk (CRUD, kategori, gambar, SKU)
- Restok (Atur Stok) & jurnal pergerakan stok (Stock Ledger)
- Peringatan **stok rendah / habis** dan notifikasi real-time

### 🔧 Servis Bengkel
- Work Order (WO) servis: buat, perbarui, mekanik, status
- Auto-complete WO menjadi `DONE` saat transaksi terkait lunas

### 📊 Dashboard & Laporan
- Dashboard admin: KPI (omzet, transaksi, laba bersih, HPP/COGS), grafik pendapatan, top produk/jasa, stok rendah, transaksi & void terbaru
- **Filter tanggal** pada seluruh metrik dashboard & laporan
- Laporan: **Laba Rugi**, Audit Penjualan & Void, Jasa & Komisi Mekanik, Valuasi Stok
- Ekspor laporan ke **Excel (.xlsx)** dan **PDF**
- **Server-side pagination** pada tabel laporan
- Audit log aktivitas (riwayat transaksi & kejadian penting)

### 💳 Pembayaran Online (Midtrans)
- QRIS & Virtual Account dengan preview nomor VA
- Webhook untuk sinkronisasi status pembayaran
- Mode **simulasi/dev** (FakePaymentGateway) tanpa memerlukan akun asli

### 💬 Chatbot WhatsApp
- Integrasi **Meta Cloud API + Google Gemini AI**
- Pemesanan servis otomatis via chat, konfirmasi via menu
- Manajemen chat, takeover/release percakapan, approval booking
- Mode simulasi untuk pengembangan

### 🔔 Notifikasi & Real-time
- **WebSocket (Laravel Reverb)** untuk notifikasi transaksi, stok, dan sistem secara real-time
- Notifikasi stok menipis tersinkron dengan stok aktual

---

## 🛠 Tech Stack

### Frontend (`frontend/`)
- **React 18** + **TypeScript 5**
- **Vite 8** (build tool)
- **Tailwind CSS 3**
- **React Router v7**
- @tanstack/react-query (data fetching & cache)
- recharts (grafik dashboard)
- Axios (HTTP client)
- Laravel Echo + Pusher (real-time)

### Backend (`backend/`)
- **Laravel 12** (PHP 8.2)
- Laravel **Sanctum** (auth SPA)
- Laravel **Reverb** (WebSocket broadcasting)
- Maatwebsite/Excel + barryvdh/laravel-dompdf (ekspor laporan)
- Midtrans SDK (pembayaran online)
- **PHPUnit** + Feature/Unit tests

### Database
- **SQLite** (development) / **MySQL 8** (production)

---

## 📁 Struktur Proyek

```
BengkelMotor/
├── backend/                 # Laravel REST API
│   ├── app/
│   │   ├── Http/Controllers/  # API Controllers
│   │   ├── Models/
│   │   ├── Services/          # Query & domain services
│   │   └── Exports/           # Excel export classes
│   ├── routes/api.php         # API routes
│   ├── database/
│   │   ├── migrations/
│   │   └── factories/
│   └── tests/                 # PHPUnit tests
├── frontend/                # React SPA
│   ├── src/
│   │   ├── app/              # Router & auth context
│   │   ├── components/       # Reusable UI components
│   │   ├── features/         # Feature modules (POS, products, reports, ...)
│   │   ├── lib/api/          # API clients
│   │   └── types/            # TypeScript types
│   └── .env.example
├── docs/                    # Dokumentasi teknis & PRD
└── README.md
```

---

## 🚀 Cara Menjalankan (Development)

### Prasyarat
- PHP ≥ 8.2 + Composer
- Node.js ≥ 18 + npm
- (Opsional) MySQL 8 untuk production

### 1. Setup Backend

```bash
cd backend
composer install

# Buat file .env dari contoh
cp .env.example .env
# (Windows: copy .env.example .env)

# Generate app key & migrate SQLite
php artisan key:generate
php artisan migrate --seed          # --seed opsional untuk data awal

# Jalankan server API
php artisan serve                   # http://localhost:8000
```

### 2. Setup Frontend

```bash
cd frontend
npm install

# Salin .env.example -> .env, sesuaikan VITE_API_URL jika perlu
cp .env.example .env

# Jalankan Vite dev server
npm run dev                         # http://localhost:5173
```

> **Catatan CORS/auth:** Laravel berperan sebagai SPA backend (Sanctum stateful). Pastikan akses dari origin frontend (mis. `http://localhost:5173`) diizinkan pada konfigurasi CORS backend.

### 3. Real-time (WebSocket) — opsional
Laravel Reverb memberikan notifikasi real-time:

```bash
cd backend
php artisan reverb:start            # WebSocket server (default port 8080)
php artisan queue:work              # Proses job (notifikasi, chatbot)
```

---

## ⚙️ Konfigurasi Penting

### Payment Gateway (Midtrans)
Buka `backend/.env`:

```
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=false
```

- **Kosongkan `MIDTRANS_SERVER_KEY`** → pakai `FakePaymentGateway` (mode simulasi dev).
- **Isi** dengan Server/Client Key dari [Midtrans Dashboard](https://dashboard.midtrans.com/) untuk mode real.
- Webhook: `POST /api/v1/payments/webhook/midtrans`.

### Chatbot WhatsApp (Meta + Gemini)
Dapatkan credentials dari **Meta Business Manager** dan API key dari [Google AI Studio](https://aistudio.google.com/). Set `WHATSAPP_SIMULATION_MODE=true` untuk development tanpa API asli.

Lihat dokumentasi lengkap di `backend/.env.example` (komentar setup terperinci) dan `docs/`.

---

## 🧪 Testing

### Backend (PHPUnit)
```bash
cd backend
composer test
# atau:
php artisan test
```

### Frontend
```bash
cd frontend
npm run typecheck    # TypeScript type check
npm run lint         # ESLint
npm run build        # Produksi build
```

---

## 📚 Dokumentasi

Dokumentasi teknis lengkap ada di folder [`docs/`](docs/):

| File | Isi |
|------|-----|
| `PRD.md` | Product Requirements Document |
| `Architecture.md` | Arsitektur & design system |
| `Schema.md` | Skema database |
| `Rules.md` | Aturan bisnis & constraint |
| `security.md` | Kebijakan & checklist keamanan |
| `PAYMENT_SETUP.md` | Setup pembayaran online |
| `DEVELOPER_GUIDE.md` | Panduan developer |

---

## 🔐 Keamanan

- Autentikasi **Sanctum** (SPA) + otorisasi berbasis **role** (ADMIN / CASHIER)
- Validasi input di sisi server untuk seluruh endpoint
- Query **parameterized** (Eloquent) — bebas SQL injection
- Laporan & endpoint Admin bersifat **admin-only**
- Ekspor hanya menyertakan kolom bisnis yang relevan (tanpa field internal)
- Kontributor disarankan menjalankan review keamanan (lihat `docs/security.md`)

---

## 📌 Catatan

- **HPP/COGS** menggunakan harga beli *snapshot* saat transaksi (bukan harga master terkini) → akurasi histori.
- Omzet laporan hanya menghitung transaksi **PAID**; transaksi **VOID** dicatat terpisah untuk audit.
- Repo ini berisi dokumentasi & histori pengembangan per fitur di `docs/` (plans & specs).

---

## 📄 Lisensi

Proyek ini merupakan perangkat lunak internal **MIT License** (lihat `backend/composer.json`). Sesuaikan sesuai kebutuhan.
