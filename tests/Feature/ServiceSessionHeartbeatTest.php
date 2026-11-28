<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ServiceSessionHeartbeatTest extends TestCase
{
    use RefreshDatabase;

    public function test_heartbeat_requires_valid_service_token(): void
    {
        $response = $this->postJson('/api/service/session/heartbeat', [
            'status' => 'playing',
        ], [
            'Authorization' => 'Bearer invalid.token',
            'X-Anirium-Device-Id' => 'device-1',
        ]);

        $response->assertStatus(401)
            ->assertJson(['status' => 'unauthorized']);
    }

    public function test_heartbeat_upserts_active_session_and_admin_can_list_it(): void
    {
        $admin = User::factory()->create([
            'name' => 'Daniel Santos',
            'email' => 'santoss.cog@gmail.com',
            'tier' => 3,
        ]);

        $other = User::factory()->create([
            'email' => 'user@example.com',
            'tier' => 1,
        ]);

        $playerSessionId = 'anirium-ps-1234567890abcdef';
        $sessionResp = $this->actingAs($admin)->getJson('/api/service/session', [
            'x-anirium-device' => 'dev-123',
            'x-anirium-player-session' => $playerSessionId,
        ]);
        $sessionResp->assertOk();
        $token = $sessionResp->json('token');

        $workId = '0fa627c1-3ee1-4f18-8771-43ceb9651da8';
        $episodeId = '453031a6-10e0-4b87-98d1-8b46afd3b387';

        $hb = $this->postJson('/api/service/session/heartbeat', [
            'status' => 'playing',
            'serviceVersion' => '2.2.0',
            'workId' => $workId,
            'episodeId' => $episodeId,
            'episodeNumber' => 8,
            'positionSeconds' => 120,
            'diagnostics' => [
                'available_qualities' => ['1080p'],
                'selected_quality' => '1080p',
                'subtitle_translation_status' => 'failed:timeout',
            ],
        ], [
            'Authorization' => 'Bearer '.$token,
            'X-Anirium-Device-Id' => 'dev-123',
        ]);

        $hb->assertOk()
            ->assertJson([
                'status' => 'ok',
                'playerSessionId' => $playerSessionId,
            ]);

        $this->assertDatabaseHas('active_service_sessions', [
            'user_id' => $admin->id,
            'player_session_id' => $playerSessionId,
            'status' => 'playing',
            'work_id' => $workId,
            'episode_number' => 8,
        ]);

        // Non-admin is forbidden
        $this->actingAs($other)->getJson('/api/admin/service-sessions')->assertForbidden();

        // Admin sees the active session
        $list = $this->actingAs($admin)->getJson('/api/admin/service-sessions');
        $list->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('sessions.0.userEmail', 'santoss.cog@gmail.com')
            ->assertJsonPath('sessions.0.episodeNumber', 8)
            ->assertJsonPath('sessions.0.diagnostics.selected_quality', '1080p');

        // Artisan command works
        $this->artisan('anirium:sessions --json')
            ->assertSuccessful();
    }

    public function test_telemetry_events_handles_p2p_heartbeat_without_server_error(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/telemetry/events', [
            'machine_fingerprint' => 'anirium-dev-test',
            'events' => [
                [
                    'event_type' => 'p2p_seeding_heartbeat',
                    'target_type' => 'global',
                    'target_id' => 'p2p_swarm',
                    'payload' => [
                        'delta_uploaded_bytes' => 1024,
                        'delta_downloaded_bytes' => 2048,
                        'seeding_seconds' => 30,
                    ],
                ],
            ],
        ]);

        $response->assertOk()->assertJson(['status' => 'recorded', 'count' => 1]);
        $this->assertSame(1, DB::table('user_interaction_events')->count());
    }
}
