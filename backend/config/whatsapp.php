<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Meta WhatsApp Cloud API Configuration
    |--------------------------------------------------------------------------
    |
    | These credentials are obtained from Meta Business Manager after setting
    | up a WhatsApp Business Platform account. Leave empty for simulation mode.
    |
    */

    'meta' => [
        'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),
        'access_token' => env('WHATSAPP_ACCESS_TOKEN'),
        'app_secret' => env('WHATSAPP_APP_SECRET'),
        'webhook_verify_token' => env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
        'api_url' => 'https://graph.facebook.com/v18.0',
    ],

    /*
    |--------------------------------------------------------------------------
    | Google Gemini AI Configuration
    |--------------------------------------------------------------------------
    |
    | Gemini AI is used for natural language processing to answer customer
    | questions dynamically based on real-time database context.
    |
    */

    'gemini' => [
        'api_key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-1.5-flash'),
        'api_url' => 'https://generativelanguage.googleapis.com/v1beta/models',
        'cache_ttl' => 900,
    ],

    /*
    |--------------------------------------------------------------------------
    | Operational Settings
    |--------------------------------------------------------------------------
    |
    | Business hours and booking constraints (hardcoded for MVP).
    |
    */

    'operational' => [
        'hours' => [
            'open' => '08:00',
            'close' => '17:00',
        ],
        'days_off' => ['sunday'],
        'max_daily_bookings' => 5,
        'booking_min_advance_hours' => 24,
    ],

    /*
    |--------------------------------------------------------------------------
    | Bot Behavior Configuration
    |--------------------------------------------------------------------------
    |
    | Settings that control how the chatbot behaves.
    |
    */

    'bot' => [
        'auto_activate_delay_minutes' => 5,
        'greeting_message' => "Halo! Saya asisten virtual bengkel. Ada yang bisa saya bantu?",
        'fallback_message' => "Maaf, saya belum bisa menjawab pertanyaan itu. Silakan hubungi admin kami.",
    ],

    /*
    |--------------------------------------------------------------------------
    | Simulation Mode
    |--------------------------------------------------------------------------
    |
    | When true: webhook signature verification is bypassed, and WhatsApp API
    | calls are logged instead of sent. Useful for local testing without real
    | Meta credentials. When false: production mode with full security checks.
    |
    */

    'simulation_mode' => (bool) env('WHATSAPP_SIMULATION_MODE', false),

];
