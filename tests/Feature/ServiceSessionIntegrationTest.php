<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PDO;
use Tests\TestCase;

class ServiceSessionIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_get_service_session(): void
    {
        $response = $this->getJson('/api/service/session', [
            'x-anirium-device' => 'test-device-123',
            'x-anirium-player-session' => 'player-session-abc-1234567890',
        ]);

        $response->assertStatus(401);
        $response->assertJson(['status' => 'unauthorized', 'reason' => 'session_revoked']);
    }

    public function test_service_validation_uses_configured_secret_without_browser_session(): void
    {
        config(['services.anirium.service_secret' => 'test-configured-service-secret']);
        $user = User::factory()->create(['email' => 'plus@example.test', 'tier' => 2]);
        $device = 'configured-secret-device';
        $payload = rtrim(strtr(base64_encode(json_encode([
            'accountId' => (string) $user->id,
            'deviceId' => $device,
            'level' => 2,
            'playerSessionId' => 'configured-player-session-12345',
            'exp' => time() + 300,
        ])), '+/', '-_'), '=');
        $signature = rtrim(strtr(base64_encode(hash_hmac('sha256', $payload,
            config('services.anirium.service_secret'), true)), '+/', '-_'), '=');
        $response = $this->getJson('/api/service/session/validate', [
            'Authorization' => "Bearer {$payload}.{$signature}",
            'X-Anirium-Device' => $device,
        ]);
        $response->assertOk()->assertJson(['accountId' => (string) $user->id, 'level' => 2]);
        $this->assertSame([], $response->headers->getCookies());

        $user->update(['tier' => 1]);
        $this->getJson('/api/service/session/validate', [
            'Authorization' => "Bearer {$payload}.{$signature}",
            'X-Anirium-Device' => $device,
        ])->assertForbidden()->assertJson(['reason' => 'plus_required']);
    }

    public function test_tier1_member_is_denied_plus_required(): void
    {
        $user = User::factory()->create([
            'email' => 'membro@anirium.com.br',
            'tier' => 1,
        ]);

        $response = $this->actingAs($user)->getJson('/api/service/session', [
            'x-anirium-device' => 'test-device-123',
            'x-anirium-player-session' => 'player-session-abc-1234567890',
        ]);

        $response->assertStatus(403);
        $response->assertJson(['status' => 'unauthorized', 'reason' => 'plus_required']);
    }

    public function test_tier2_or_admin_gets_authorized_token_and_validates_with_service(): void
    {
        $admin = User::factory()->create([
            'email' => 'santoss.cog@gmail.com', // Admin Supremo
            'tier' => 3,
        ]);

        $deviceId = 'device-mac-windows-xyz';
        $playerSessionId = 'player-sess-1234567890-abcdef';

        // 1. Obter Token de Sessão para o Anirium Service
        $response = $this->actingAs($admin)->getJson('/api/service/session', [
            'x-anirium-device' => $deviceId,
            'x-anirium-player-session' => $playerSessionId,
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['status', 'token', 'expiresIn', 'deviceId']);
        $this->assertEquals('authorized', $response->json('status'));

        $token = $response->json('token');
        $this->assertNotEmpty($token);

        // 2. Validação da Sessão (Chamada feita pelo executável anirium-service na porta 4004)
        $validateResponse = $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Anirium-Device' => $deviceId,
        ])->getJson('/api/service/session/validate');

        $validateResponse->assertStatus(200);
        $validateResponse->assertJson([
            'status' => 'authorized',
            'accountId' => (string) $admin->id,
            'level' => 3,
            'playerSessionId' => $playerSessionId,
        ]);
        $this->assertContains('player-pro', $validateResponse->json('authorizedAddonIds'));

        // 3. Liberação da Sessão ao fechar o player
        $releaseResponse = $this->actingAs($admin)->deleteJson('/api/service/session');
        $releaseResponse->assertStatus(204);
    }

    public function test_service_validation_falls_back_to_snapshot_during_sqlite_lock_and_fails_closed_after_downgrade(): void
    {
        $originalConfig = config('database.connections.sqlite');
        $originalPdo = DB::connection('sqlite')->getPdo();
        $path = tempnam(sys_get_temp_dir(), 'service-session-lock-');
        $locker = null;

        try {
            while (DB::connection('sqlite')->transactionLevel() > 0) {
                DB::connection('sqlite')->rollBack();
            }

            config([
                'database.connections.sqlite' => array_merge($originalConfig, [
                    'database' => $path,
                    'busy_timeout' => 10,
                ]),
                'services.anirium.session_validate_busy_timeout_ms' => 10,
            ]);
            DB::purge('sqlite');
            $this->artisan('migrate', ['--force' => true]);

            $user = User::factory()->create(['email' => 'snapshot-plus@example.test', 'tier' => 2]);
            $deviceId = 'snapshot-lock-device-123';
            $playerSessionId = 'snapshot-lock-player-session-123456';

            $sessionResponse = $this->actingAs($user)->getJson('/api/service/session', [
                'x-anirium-device' => $deviceId,
                'x-anirium-player-session' => $playerSessionId,
            ])->assertOk();

            $headers = [
                'Authorization' => 'Bearer '.$sessionResponse->json('token'),
                'X-Anirium-Device' => $deviceId,
            ];

            $this->getJson('/api/service/session/validate', $headers)
                ->assertOk()
                ->assertJson([
                    'status' => 'authorized',
                    'accountId' => (string) $user->id,
                    'level' => 2,
                    'playerSessionId' => $playerSessionId,
                ]);

            $locker = new PDO('sqlite:'.$path);
            $locker->exec('BEGIN EXCLUSIVE');

            $this->getJson('/api/service/session/validate', $headers)
                ->assertOk()
                ->assertJson([
                    'status' => 'authorized',
                    'accountId' => (string) $user->id,
                    'level' => 2,
                    'playerSessionId' => $playerSessionId,
                ]);

            $locker->exec('COMMIT');
            unset($locker);
            $locker = null;

            $user->update(['tier' => 1]);

            $this->getJson('/api/service/session/validate', $headers)
                ->assertForbidden()
                ->assertJson(['reason' => 'plus_required']);

            $locker = new PDO('sqlite:'.$path);
            $locker->exec('BEGIN EXCLUSIVE');

            $this->getJson('/api/service/session/validate', $headers)
                ->assertServiceUnavailable()
                ->assertJson(['status' => 'unauthorized', 'reason' => 'core_unavailable']);
        } finally {
            if ($locker instanceof PDO) {
                try {
                    if ($locker->inTransaction()) {
                        $locker->exec('ROLLBACK');
                    }
                } catch (\Throwable) {
                }
                unset($locker);
            }

            DB::purge('sqlite');
            config(['database.connections.sqlite' => $originalConfig]);
            DB::connection('sqlite')->setPdo($originalPdo);
            @unlink($path);
            @unlink($path.'-journal');
        }
    }
}
