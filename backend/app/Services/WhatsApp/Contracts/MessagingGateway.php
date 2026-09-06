<?php

namespace App\Services\WhatsApp\Contracts;

interface MessagingGateway
{
    public function sendMessage(string $phoneNumber, string $message): bool;
    
    public function verifySignature(string $payload, string $signature): bool;
    
    public function parseIncomingMessage(array $payload): ?array;
}
