<?php

namespace Tests\Unit\Config;

use PHPUnit\Framework\TestCase;

class WhatsAppConfigTest extends TestCase
{
    public function test_false_string_cast_produces_false(): void
    {
        $result = filter_var('false', FILTER_VALIDATE_BOOLEAN);

        $this->assertFalse($result);
    }

    public function test_true_string_cast_produces_true(): void
    {
        $result = filter_var('true', FILTER_VALIDATE_BOOLEAN);

        $this->assertTrue($result);
    }

    public function test_config_uses_filter_var_not_bool_cast(): void
    {
        $config = file_get_contents(__DIR__ . '/../../../config/whatsapp.php');

        $this->assertStringContainsString(
            "filter_var(env('WHATSAPP_SIMULATION_MODE', false), FILTER_VALIDATE_BOOLEAN)",
            $config,
        );
        $this->assertStringNotContainsString(
            "(bool) env('WHATSAPP_SIMULATION_MODE', false)",
            $config,
        );
    }
}
