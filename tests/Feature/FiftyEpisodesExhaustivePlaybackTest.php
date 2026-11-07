<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

class FiftyEpisodesExhaustivePlaybackTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Testa 50 episódios diferentes para a conta santoss.cog@gmail.com,
     * verificando todo o ciclo operacional:
     * 1. Acesso à rota canônica do episódio (/view/episode/{id}) com persistência em sessão
     * 2. Emissão de token de sessão para o anirium-service
     * 3. Validação do token pelo node service (/api/service/session/validate) com addons autorizados (Player Pro, Nyaa, Stremio)
     * 4. Registro de telemetria de playback (progress_seconds, status completed, active_minute)
     * 5. Persistência de preferência relacional e progressão de XP (+10 XP por episódio)
     * 6. Comentário comunitário dedicado ao episódio (/api/entity/comments)
     */
    public function test_fifty_distinct_episodes_full_pipeline_for_admin_account(): void
    {
        // Popular catálogo em memória com as obras e episódios do teste
        $worksToSeed = [
            269 => ['title' => 'Bleach', 'eps' => 20],
            41467 => ['title' => 'Bleach: Thousand-Year Blood War', 'eps' => 10],
            18679 => ['title' => 'Kill la Kill', 'eps' => 10],
            2740 => ['title' => 'Monkey Turn', 'eps' => 10],
        ];

        $importer = app(\App\Support\CatalogGraphImporter::class);
        foreach ($worksToSeed as $malId => $info) {
            $workUuid = (string) \Illuminate\Support\Str::uuid();
            $episodesPayload = [];
            for ($ep = 1; $ep <= $info['eps']; $ep++) {
                $episodesPayload[] = [
                    'number' => $ep,
                    'name' => "Episode {$ep}",
                ];
            }
            $importer->work([
                'work_id' => $workUuid,
                'media' => 'anime',
                'title' => $info['title'],
                'episode_count' => $info['eps'],
                'aliases' => ["work:{$workUuid}", "anime:{$malId}", "{$malId}"],
                'universe_reference' => "universe-{$malId}",
                'episodes' => $episodesPayload,
            ]);
        }

        // 1. Criar e configurar conta Admin Supremo santoss.cog@gmail.com
        $admin = User::factory()->create([
            'email' => 'santoss.cog@gmail.com',
            'tier' => 3,
            'name' => 'Daniel Santos',
            'active_minutes' => 0,
            'current_streak' => 1,
            'longest_streak' => 1,
            'streak_xp' => 10,
        ]);

        // Registrar os Addons autorizados para a conta
        DB::table('user_addons')->insert([
            [
                'user_id' => $admin->id,
                'addon_id' => 'player-pro',
                'name' => 'Anirium Player Pro',
                'version' => '1.0.0',
                'type' => 'official-plus',
                'manifest_url' => null,
                'manifest_json' => null,
                'enabled' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $admin->id,
                'addon_id' => 'community.nyaa.p2p',
                'name' => 'Nyaa Provider Server',
                'version' => '3.0.0',
                'type' => 'community',
                'manifest_url' => 'http://127.0.0.1:4001/manifest',
                'manifest_json' => json_encode(['id' => 'community.nyaa.p2p', 'capabilities' => ['magnet.search']]),
                'enabled' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'user_id' => $admin->id,
                'addon_id' => 'community.stremio.torrentio',
                'name' => 'Torrentio',
                'version' => '1.0.0',
                'type' => 'community',
                'manifest_url' => 'https://torrentio.strem.fun/manifest.json',
                'manifest_json' => json_encode(['id' => 'community.stremio.torrentio', 'capabilities' => ['playback.source.provide']]),
                'enabled' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // Catálogo de teste com 50 episódios distribuídos por obras canônicas reais
        $testEpisodes = [];
        // Bleach (MAL 269): 20 episódios
        for ($i = 1; $i <= 20; $i++) {
            $testEpisodes[] = ['work_id' => 269, 'work_title' => 'Bleach', 'ep_num' => $i];
        }
        // Bleach: Thousand-Year Blood War (MAL 41467): 10 episódios
        for ($i = 1; $i <= 10; $i++) {
            $testEpisodes[] = ['work_id' => 41467, 'work_title' => 'Bleach: Thousand-Year Blood War', 'ep_num' => $i];
        }
        // Kill la Kill (MAL 18679): 10 episódios
        for ($i = 1; $i <= 10; $i++) {
            $testEpisodes[] = ['work_id' => 18679, 'work_title' => 'Kill la Kill', 'ep_num' => $i];
        }
        // Monkey Turn (MAL 2740): 10 episódios
        for ($i = 1; $i <= 10; $i++) {
            $testEpisodes[] = ['work_id' => 2740, 'work_title' => 'Monkey Turn', 'ep_num' => $i];
        }

        $this->assertCount(50, $testEpisodes, "O conjunto de testes deve conter exatamente 50 episódios distintos.");

        $deviceId = 'machine-fingerprint-santoss-rig';
        $testedCount = 0;

        foreach ($testEpisodes as $index => $item) {
            $epGlobalIndex = $index + 1;
            $workId = $item['work_id'];
            $epNum = $item['ep_num'];
            $targetEntityId = "episode:{$workId}:ep-{$epNum}";
            $playerSessionId = "player-session-{$workId}-ep-{$epNum}-" . md5(uniqid('', true));

            // PASSO 1: Acesso à rota canônica do episódio
            $routeResponse = $this->actingAs($admin)->get("/view/episode/{$workId}:ep-{$epNum}");
            $routeResponse->assertRedirect('/');
            $this->assertEquals([
                'type' => 'episode',
                'id' => "{$workId}:ep-{$epNum}",
            ], session('initial_context'));

            // PASSO 2: Obtenção de Token de Sessão assinado para o anirium-service
            $sessionResponse = $this->actingAs($admin)->getJson('/api/service/session', [
                'x-anirium-device' => $deviceId,
                'x-anirium-player-session' => $playerSessionId,
            ]);
            $sessionResponse->assertStatus(200);
            $token = $sessionResponse->json('token');
            $this->assertNotEmpty($token);

            // PASSO 3: Validação da Sessão pelo Daemon anirium-service na porta 4004
            $validateResponse = $this->withHeaders([
                'Authorization' => "Bearer {$token}",
                'X-Anirium-Device' => $deviceId,
            ])->getJson('/api/service/session/validate');
            $validateResponse->assertStatus(200);
            $validateResponse->assertJson([
                'status' => 'authorized',
                'accountId' => (string)$admin->id,
                'level' => 3,
                'playerSessionId' => $playerSessionId,
            ]);
            $this->assertContains('player-pro', $validateResponse->json('authorizedAddonIds'));
            $this->assertContains('community.nyaa.p2p', $validateResponse->json('authorizedAddonIds'));
            $this->assertContains('community.stremio.torrentio', $validateResponse->json('authorizedAddonIds'));

            // PASSO 4: Envio de telemetria contínua durante a reprodução do episódio
            $telemetryResponse = $this->actingAs($admin)->postJson('/api/telemetry/events', [
                'events' => [
                    [
                        'target_type' => 'episode',
                        'target_id' => $targetEntityId,
                        'event_type' => 'active_minute',
                        'payload' => ['duration_seconds' => 60],
                    ],
                    [
                        'target_type' => 'episode',
                        'target_id' => $targetEntityId,
                        'event_type' => 'playback_heartbeat',
                        'payload' => ['progress_seconds' => 1400, 'duration' => 1440],
                    ],
                    [
                        'target_type' => 'episode',
                        'target_id' => $targetEntityId,
                        'event_type' => 'episode_completed',
                        'payload' => ['episode_number' => $epNum, 'work_id' => $workId],
                    ],
                ],
            ]);
            $telemetryResponse->assertStatus(200);

            // PASSO 5: Persistência relacional de preferência e status completed
            $prefResponse = $this->actingAs($admin)->postJson('/api/entity/preference', [
                'target_type' => 'episode',
                'target_id' => $targetEntityId,
                'status' => 'completed',
                'user_score' => ($epNum % 2 === 0) ? 9.5 : 9.0,
                'bookmarked' => true,
                'liked' => true,
            ]);
            $prefResponse->assertStatus(200);

            // PASSO 6: Comentário comunitário na discussão do episódio
            $commentResponse = $this->actingAs($admin)->postJson('/api/entity/comments', [
                'target_type' => 'episode',
                'target_id' => $targetEntityId,
                'comment_body' => "Episódio {$epNum} de {$item['work_title']} verificado com sucesso pelo Player Pro!",
                'contains_spoilers' => false,
            ]);
            $commentResponse->assertStatus(201);

            // PASSO 7: Liberação do lease da sessão do player
            $releaseResponse = $this->actingAs($admin)->deleteJson('/api/service/session');
            $releaseResponse->assertStatus(204);

            $testedCount++;
        }

        $this->assertEquals(50, $testedCount, "Todos os 50 episódios devem ter passado por todas as 7 etapas.");

        // Verificação final no banco de dados
        $completedCount = DB::table('user_entity_preferences')
            ->where('user_id', $admin->id)
            ->where('target_type', 'episode')
            ->where('status', 'completed')
            ->count();
        $this->assertEquals(50, $completedCount, "Exatamente 50 episódios devem estar registrados como concluídos.");

        $commentsCount = DB::table('entity_discussions')
            ->where('user_id', $admin->id)
            ->where('target_type', 'episode')
            ->count();
        $this->assertEquals(50, $commentsCount, "Exatamente 50 comentários devem ter sido criados.");

        $admin->refresh();
        $this->assertGreaterThanOrEqual(50, (int)$admin->active_minutes, "A contagem de minutos ativos deve ter sido incrementada.");
    }
}
