<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class P2pGamificationTelemetryTest extends TestCase
{
    use RefreshDatabase;

    public function test_p2p_seeding_heartbeat_accumulates_network_metrics_and_grants_xp(): void
    {
        $user = User::factory()->create([
            'bytes_uploaded' => 0,
            'bytes_downloaded' => 0,
            'seeding_seconds' => 0,
            'seeding_xp' => 0,
        ]);

        $this->actingAs($user);

        // Envia um heartbeat de seeding: 10 MB de upload, 25 MB de download e 60 segundos de seed
        $response = $this->postJson('/api/telemetry/events', [
            'machine_fingerprint' => 'test-device-uuid-1234',
            'events' => [
                [
                    'target_type' => 'global',
                    'target_id' => 'p2p_swarm',
                    'event_type' => 'p2p_seeding_heartbeat',
                    'payload' => [
                        'delta_uploaded_bytes' => 10 * 1024 * 1024,
                        'delta_downloaded_bytes' => 25 * 1024 * 1024,
                        'seeding_seconds' => 60,
                        'peers' => 18,
                    ],
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJson([
            'status' => 'recorded',
            'count' => 1,
            'bytes_uploaded' => 10 * 1024 * 1024,
            'bytes_downloaded' => 25 * 1024 * 1024,
            'seeding_seconds' => 60,
        ]);

        $user->refresh();
        $this->assertEquals(10 * 1024 * 1024, $user->bytes_uploaded);
        $this->assertEquals(25 * 1024 * 1024, $user->bytes_downloaded);
        $this->assertEquals(60, $user->seeding_seconds);
        // 10 MB = 10 XP + 60s / 30 = 2 XP => 12 XP de seeding
        $this->assertEquals(12, $user->seeding_xp);
    }
}
