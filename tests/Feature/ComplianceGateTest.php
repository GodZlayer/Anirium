<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ComplianceGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_lobby_renders_global_cookie_and_blocker_gates(): void
    {
        $response = $this->get('/');

        $response->assertOk();
        $response->assertSee('anirium-cookie-gate', false);
        $response->assertSee('anirium-blocker-gate', false);
        $response->assertSee('/assets/ad-check.js', false);
    }

    public function test_local_blocker_bait_script_exists(): void
    {
        $path = public_path('assets/ad-check.js');

        $this->assertFileExists($path);
        $this->assertStringContainsString('__aniriumClientCheck', (string) file_get_contents($path));
    }
}
