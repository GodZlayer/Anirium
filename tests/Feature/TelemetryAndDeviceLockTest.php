<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class TelemetryAndDeviceLockTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Teste 1: Visitante anônimo pode sincronizar dispositivo sem bloqueio concorrente.
     */
    public function test_guest_can_register_device_cleanly(): void
    {
        $response = $this->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'guest-machine-fp-12345',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'guest_allowed']);
    }

    /**
     * Teste 2: Falha ao tentar registrar sem enviar machine_fingerprint.
     */
    public function test_register_device_requires_fingerprint(): void
    {
        $response = $this->postJson(route('session.register_device'), []);
        $response->assertStatus(422);
        $response->assertJson(['error' => 'machine_fingerprint_required']);
    }

    /**
     * Teste 3: Usuário autenticado registra sua máquina com sucesso.
     */
    public function test_authenticated_user_registers_machine(): void
    {
        $user = User::factory()->create(['tier' => 2]);

        $response = $this->actingAs($user)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'user-workstation-aaa-999',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'status' => 'device_synchronized',
            'tier' => 2,
        ]);

        $this->assertDatabaseHas('active_user_devices', [
            'user_id' => $user->id,
            'machine_fingerprint' => 'user-workstation-aaa-999',
        ]);
    }

    /**
     * Teste 4: Trava de Concorrência Fina (Status 409) se outra máquina tentar acessar
     * enquanto a primeira estiver com ping ativo dentro de 120s.
     */
    public function test_concurrent_session_is_blocked_with_status_409(): void
    {
        $user = User::factory()->create();

        // Primeira máquina registra
        $this->actingAs($user)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'machine-legitimate-001',
        ])->assertStatus(200);

        // Segunda máquina tenta roubar sessão com ping ativo
        $intruderResponse = $this->actingAs($user)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'machine-intruder-002',
        ]);

        $intruderResponse->assertStatus(409);
        $intruderResponse->assertJson([
            'error' => 'concurrent_session_blocked',
        ]);
    }

    /**
     * Teste 5: Se o ping anterior expirou (> 120 segundos), nova máquina assume sem 409.
     */
    public function test_expired_session_allows_new_machine(): void
    {
        $user = User::factory()->create();

        // Inserir registro com ping antigo (150s atrás)
        DB::table('active_user_devices')->insert([
            'user_id' => $user->id,
            'machine_fingerprint' => 'machine-old-001',
            'ip_address' => '127.0.0.1',
            'user_agent' => 'OldBrowser',
            'last_ping_at' => now()->subSeconds(150),
            'created_at' => now()->subSeconds(150),
            'updated_at' => now()->subSeconds(150),
        ]);

        // Nova máquina conecta
        $response = $this->actingAs($user)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'machine-new-002',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['status' => 'device_synchronized']);

        $this->assertDatabaseHas('active_user_devices', [
            'user_id' => $user->id,
            'machine_fingerprint' => 'machine-new-002',
        ]);
    }

    /**
     * Teste 6: Gravação em lote (Batch) de telemetria leve anônima ou autenticada.
     */
    public function test_telemetry_batch_events_recorded_properly(): void
    {
        $work = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $work, 'media' => 'anime', 'title' => 'Telemetry fixture', 'aliases' => [], 'universe_reference' => 'fixture']);
        $universe = DB::table('catalog_universes')->value('id');
        $response = $this->postJson(route('telemetry.events'), [
            'machine_fingerprint' => 'bench-fp-999',
            'events' => [
                [
                    'target_type' => 'global',
                    'target_id' => 'timeline',
                    'event_type' => 'scroll_milestone',
                    'payload' => ['t' => 0.42],
                ],
                [
                    'target_type' => 'universe',
                    'target_id' => $universe,
                    'event_type' => 'click_universe',
                    'payload' => ['source' => 'carousel'],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'status' => 'recorded',
            'count' => 2,
        ]);

        $this->assertDatabaseCount('user_interaction_events', 2);
    }
}
