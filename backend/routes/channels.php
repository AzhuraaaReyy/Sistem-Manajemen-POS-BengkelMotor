<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('whatsapp-chats', function ($user) {
    return $user instanceof User && $user->role === 'ADMIN' && $user->is_active;
});
