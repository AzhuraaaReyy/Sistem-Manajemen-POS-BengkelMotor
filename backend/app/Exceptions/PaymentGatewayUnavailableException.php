<?php

namespace App\Exceptions;

use RuntimeException;

class PaymentGatewayUnavailableException extends RuntimeException
{
    public ?int $saleId = null;

    public function __construct(int $saleId, string $message = 'Payment gateway sedang gangguan. Silakan gunakan metode tunai dahulu.')
    {
        parent::__construct($message, 503);
        $this->saleId = $saleId;
    }
}
