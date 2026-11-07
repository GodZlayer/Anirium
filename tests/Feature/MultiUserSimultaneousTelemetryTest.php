<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class MultiUserSimultaneousTelemetryTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Teste 1: Multi-usuários simultâneos independentes não sofrem colisão nem 409
     * Cada usuário pode registrar sua própria máquina com fingerprints e IPs distintos.
     */
    public function test_multiple_independent_users_can_operate_simultaneously_without_conflict(): void
    {
        $userA = User::factory()->create(['name' => 'Usuário Alfa', 'tier' => 1]);
        $userB = User::factory()->create(['name' => 'Usuário Beta', 'tier' => 2]);
        $userC = User::factory()->create(['name' => 'Admin Supremo', 'email' => 'santoss.cog@gmail.com', 'tier' => 3]);

        // Usuário A na Máquina A
        $resA = $this->actingAs($userA)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'fp-machine-alpha-001',
        ]);
        $resA->assertStatus(200)->assertJson(['status' => 'device_synchronized', 'tier' => 1]);

        // Usuário B na Máquina B
        $resB = $this->actingAs($userB)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'fp-machine-beta-002',
        ]);
        $resB->assertStatus(200)->assertJson(['status' => 'device_synchronized', 'tier' => 2]);

        // Usuário C na Máquina C
        $resC = $this->actingAs($userC)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'fp-machine-gamma-003',
        ]);
        $resC->assertStatus(200)->assertJson(['status' => 'device_synchronized', 'tier' => 3]);

        // Assegurar isolamento das 3 máquinas registradas
        $this->assertDatabaseCount('active_user_devices', 3);
        $this->assertDatabaseHas('active_user_devices', ['user_id' => $userA->id, 'machine_fingerprint' => 'fp-machine-alpha-001']);
        $this->assertDatabaseHas('active_user_devices', ['user_id' => $userB->id, 'machine_fingerprint' => 'fp-machine-beta-002']);
        $this->assertDatabaseHas('active_user_devices', ['user_id' => $userC->id, 'machine_fingerprint' => 'fp-machine-gamma-003']);
    }

    /**
     * Teste 2: Telemetria simultânea isolada por usuário e tipo de ação (sem misturar eventos)
     * Usuário A faz scroll no Lobby, Usuário B explora Universo, Usuário C assiste Episódio.
     */
    public function test_simultaneous_telemetry_streams_are_properly_isolated_per_user_and_context(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $guestFingerprint = 'fp-guest-delta-004';
        $work = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $work, 'media' => 'anime', 'title' => 'Telemetry fixture', 'aliases' => [], 'universe_reference' => 'fixture',
            'episodes' => [['number' => 1]], 'arcs' => [['arcId' => 'published-arc', 'name' => 'Published arc', 'startEp' => 1, 'endEp' => 1, 'source_url' => 'https://example.org/arc']]]);
        $universe = DB::table('catalog_universes')->value('id');
        $arc = DB::table('catalog_arcs')->value('id');
        $episode = DB::table('catalog_episodes')->value('id');

        // 1. Usuário A navegando no Lobby (ações de scroll)
        $this->actingAs($userA)->postJson(route('telemetry.events'), [
            'machine_fingerprint' => 'fp-user-a',
            'events' => [
                ['target_type' => 'global', 'target_id' => 'hero', 'event_type' => 'scroll_playhead', 'payload' => ['t' => 0.15]],
                ['target_type' => 'global', 'target_id' => 'timeline', 'event_type' => 'scroll_playhead', 'payload' => ['t' => 0.45]],
            ],
        ])->assertStatus(200)->assertJson(['count' => 2]);

        // 2. Usuário B explorando Universo e Arcos de Bleach
        $this->actingAs($userB)->postJson(route('telemetry.events'), [
            'machine_fingerprint' => 'fp-user-b',
            'events' => [
                ['target_type' => 'universe', 'target_id' => $universe, 'event_type' => 'view_arc', 'payload' => ['arc_id' => $arc]],
                ['target_type' => 'arc', 'target_id' => $arc, 'event_type' => 'toggle_like', 'payload' => ['liked' => true]],
            ],
        ])->assertStatus(200)->assertJson(['count' => 2]);

        // 3. Visitante anônimo assistindo Episódio (desloga para simular requisição guest pura)
        Auth::logout();
        $this->postJson(route('telemetry.events'), [
            'machine_fingerprint' => $guestFingerprint,
            'events' => [
                ['target_type' => 'episode', 'target_id' => $episode, 'event_type' => 'play_episode'],
            ],
        ])->assertStatus(200)->assertJson(['count' => 1]);

        // Validar integridade dos registros
        $this->assertDatabaseCount('user_interaction_events', 5);

        // Usuário A tem apenas 2 eventos e ambos de Lobby
        $eventsUserA = DB::table('user_interaction_events')->where('user_id', $userA->id)->get();
        $this->assertCount(2, $eventsUserA);
        $this->assertEquals('global', $eventsUserA[0]->target_type);
        $this->assertEquals('global', $eventsUserA[1]->target_type);

        // Usuário B tem 2 eventos específicos de Universo/Arco
        $eventsUserB = DB::table('user_interaction_events')->where('user_id', $userB->id)->get();
        $this->assertCount(2, $eventsUserB);
        $this->assertEquals('universe', $eventsUserB[0]->target_type);
        $this->assertEquals('arc', $eventsUserB[1]->target_type);

        // Visitante anônimo tem user_id nulo e machine_fingerprint dele
        $guestEvents = DB::table('user_interaction_events')->whereNull('user_id')->get();
        $this->assertCount(1, $guestEvents);
        $this->assertEquals($guestFingerprint, $guestEvents[0]->machine_fingerprint);
        $this->assertEquals('episode', $guestEvents[0]->target_type);
        $this->assertEquals($episode, $guestEvents[0]->entity_id);
    }

    /**
     * Teste 3: Concorrência entre contas diferentes NÃO bloqueia (apenas mesma conta é bloqueada)
     * Prova que a trava de 409 é estritamente por ID de Usuário individual e não global.
     */
    public function test_device_lock_is_strictly_per_user_account(): void
    {
        $user1 = User::factory()->create();
        $user2 = User::factory()->create();

        // Usuário 1 conecta
        $this->actingAs($user1)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'fp-user1-machine1',
        ])->assertStatus(200);

        // Usuário 2 conecta imediatamente em outra máquina
        $this->actingAs($user2)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'fp-user2-machine2',
        ])->assertStatus(200);

        // Usuário 1 tenta conectar em uma SEGUNDA máquina ao mesmo tempo -> Bloqueado (409)
        $this->actingAs($user1)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'fp-user1-intruder',
        ])->assertStatus(409)->assertJson(['error' => 'concurrent_session_blocked']);

        // Usuário 2 continua com acesso 100% normal e sem interferência
        $this->actingAs($user2)->postJson(route('session.register_device'), [
            'machine_fingerprint' => 'fp-user2-machine2', // Mesma máquina dele
        ])->assertStatus(200);
    }
}
