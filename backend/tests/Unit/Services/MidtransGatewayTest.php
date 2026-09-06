<?php

namespace Tests\Unit\Services;

use App\Services\Payments\DTO\PendingChargeRequest;
use App\Services\Payments\Gateways\MidtransGateway;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class MidtransGatewayTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.midtrans.server_key' => 'SB-Mid-server-xxxx']);
        config(['services.midtrans.charge_url' => 'https://api.sandbox.midtrans.com/v2']);
    }

    public function test_verify_signature_returns_true_for_valid_signature(): void
    {
        $gateway = new MidtransGateway();
        $serverKey = config('services.midtrans.server_key');
        $payload = ['order_id' => 'SALE-001', 'status_code' => '200', 'gross_amount' => '90000.00'];
        $signature = hash('sha512', 'SALE-001' . '200' . '90000.00' . $serverKey);

        $this->assertTrue($gateway->verifySignature($payload, $signature));
    }

    public function test_verify_signature_returns_false_for_invalid_signature(): void
    {
        $gateway = new MidtransGateway();
        $payload = ['order_id' => 'SALE-001', 'status_code' => '200', 'gross_amount' => '90000.00'];

        $this->assertFalse($gateway->verifySignature($payload, 'wrong-signature'));
    }

    public function test_parse_notification_maps_settlement_to_paid(): void
    {
        $gateway = new MidtransGateway();
        $notification = $gateway->parseNotification([
            'order_id' => 'SALE-001',
            'transaction_status' => 'settlement',
            'gross_amount' => '90000.00',
            'transaction_id' => 'TX-123',
        ]);

        $this->assertSame('SALE-001', $notification->orderId);
        $this->assertSame('PAID', $notification->status);
        $this->assertSame('90000.00', $notification->grossAmount);
    }

    public function test_parse_notification_maps_expire_to_expired(): void
    {
        $gateway = new MidtransGateway();
        $notification = $gateway->parseNotification([
            'order_id' => 'SALE-001',
            'transaction_status' => 'expire',
            'gross_amount' => '90000.00',
            'transaction_id' => 'TX-123',
        ]);

        $this->assertSame('EXPIRED', $notification->status);
    }

    public function test_create_charge_sends_correct_payload_for_qris(): void
    {
        Http::fake([
            'api.sandbox.midtrans.com/v2/charge' => Http::response([
                'transaction_id' => 'TX-QRIS-001',
                'actions' => [
                    ['name' => 'generate-qr-code', 'url' => 'https://example.test/qr.png'],
                    ['name' => 'qr-code', 'url' => 'qr://string-data'],
                ],
                'expiry_time' => now()->addMinutes(15)->toIso8601String(),
            ], 200),
        ]);

        $gateway = new MidtransGateway();
        $result = $gateway->createCharge(new PendingChargeRequest(
            orderId: 1,
            saleCode: 'SALE-001',
            method: 'QRIS',
            grossAmount: '90000.00',
            items: [['id' => 1, 'name' => 'Product', 'price' => 90000, 'quantity' => 1]],
        ));

        Http::assertSent(fn ($request) =>
            $request->url() === 'https://api.sandbox.midtrans.com/v2/charge'
            && $request->data()['payment_type'] === 'qris'
            && $request->data()['transaction_details']['order_id'] === 'SALE-001'
        );

        $this->assertSame('TX-QRIS-001', $result->gatewayTransactionId);
        $this->assertSame('https://example.test/qr.png', $result->qrUrl);
        $this->assertSame('qr://string-data', $result->qrString);
    }

    public function test_create_charge_sends_correct_payload_for_va(): void
    {
        Http::fake([
            'api.sandbox.midtrans.com/v2/charge' => Http::response([
                'transaction_id' => 'TX-VA-001',
                'va_numbers' => [['va_number' => '1234567890', 'bank' => 'bca']],
                'expiry_time' => now()->addMinutes(15)->toIso8601String(),
            ], 200),
        ]);

        $gateway = new MidtransGateway();
        $result = $gateway->createCharge(new PendingChargeRequest(
            orderId: 1,
            saleCode: 'SALE-001',
            method: 'VA',
            grossAmount: '90000.00',
            items: [['id' => 1, 'name' => 'Product', 'price' => 90000, 'quantity' => 1]],
        ));

        $this->assertSame('1234567890', $result->vaNumber);
        $this->assertSame('VA', $result->method);
    }

    public function test_create_charge_throws_runtime_exception_on_5xx(): void
    {
        Http::fake([
            'api.sandbox.midtrans.com/v2/charge' => Http::response('error', 500),
        ]);

        $gateway = new MidtransGateway();
        try {
            $gateway->createCharge(new PendingChargeRequest(
                orderId: 1,
                saleCode: 'SALE-001',
                method: 'QRIS',
                grossAmount: '90000.00',
                items: [['id' => 1, 'name' => 'Product', 'price' => 90000, 'quantity' => 1]],
            ));
            $this->fail('Expected RuntimeException was not thrown');
        } catch (RuntimeException $e) {
            $this->assertSame(500, $e->getCode());
        }
    }

    public function test_create_charge_propagates_connection_exception(): void
    {
        Http::fake([
            'api.sandbox.midtrans.com/v2/charge' => fn () => throw new ConnectionException('Connection refused'),
        ]);

        $gateway = new MidtransGateway();
        try {
            $gateway->createCharge(new PendingChargeRequest(
                orderId: 1,
                saleCode: 'SALE-001',
                method: 'QRIS',
                grossAmount: '90000.00',
                items: [['id' => 1, 'name' => 'Product', 'price' => 90000, 'quantity' => 1]],
            ));
            $this->fail('Expected ConnectionException was not thrown');
        } catch (ConnectionException $e) {
            $this->assertSame('Connection refused', $e->getMessage());
        }
    }
}
