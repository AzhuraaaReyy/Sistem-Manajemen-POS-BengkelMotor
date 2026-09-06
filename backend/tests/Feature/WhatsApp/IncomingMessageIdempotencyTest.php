<?php

namespace Tests\Feature\WhatsApp;

use App\Jobs\WhatsApp\ProcessIncomingWhatsAppMessage;
use App\Models\WhatsAppMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncomingMessageIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_duplicate_meta_message_id_is_not_processed_twice(): void
    {
        $from = '628123456789';

        ProcessIncomingWhatsAppMessage::dispatchSync($from, 'halo', 'wamid.same1');
        $countAfterFirst = WhatsAppMessage::count();

        ProcessIncomingWhatsAppMessage::dispatchSync($from, 'halo', 'wamid.same1');
        $countAfterSecond = WhatsAppMessage::count();

        $this->assertSame(1, $countAfterFirst);
        $this->assertSame(1, $countAfterSecond);
        $this->assertSame($countAfterFirst, $countAfterSecond);
    }

    public function test_different_meta_message_ids_create_separate_messages(): void
    {
        $from = '628123456789';

        ProcessIncomingWhatsAppMessage::dispatchSync($from, 'halo', 'wamid.one');
        ProcessIncomingWhatsAppMessage::dispatchSync($from, 'halo lagi', 'wamid.two');

        $this->assertSame(2, WhatsAppMessage::count());
    }
}
