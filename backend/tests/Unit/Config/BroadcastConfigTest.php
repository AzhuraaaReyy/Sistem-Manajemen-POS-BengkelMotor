<?php

namespace Tests\Unit\Config;

use PHPUnit\Framework\TestCase;

class BroadcastConfigTest extends TestCase
{
    public function test_example_env_documents_reverb_as_broadcast_connection(): void
    {
        $example = file_get_contents(__DIR__ . '/../../../.env.example');

        $this->assertStringContainsString('BROADCAST_CONNECTION=reverb', $example);
        $this->assertStringContainsString('REVERB_APP_KEY=', $example);
        $this->assertStringContainsString('REVERB_APP_SECRET=', $example);
    }

    public function test_example_env_has_single_unambiguous_broadcast_connection(): void
    {
        $example = file_get_contents(__DIR__ . '/../../../.env.example');
        $occurrences = substr_count($example, 'BROADCAST_CONNECTION=');

        $this->assertSame(1, $occurrences, 'Harus ada tepat satu BROADCAST_CONNECTION agar tidak ambigu');
    }
}
