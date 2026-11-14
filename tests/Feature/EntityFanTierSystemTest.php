<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\EntityFanTierEvaluator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EntityFanTierSystemTest extends TestCase
{
    use RefreshDatabase;

    public function test_entity_fan_tier_requires_all_interactions_and_total_time_minus_5_minutes(): void
    {
        $user = User::factory()->create(['streak_xp' => 0]);

        // Cria uma obra de teste
        $workId = 'work-fan-test-01';
        DB::table('catalog_entities')->insert([
            'id' => $workId,
            'kind' => 'work',
            'resolution_status' => 'verified',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('catalog_works')->insert([
            'id' => $workId,
            'title' => 'Bleach: Sennen Kessen-hen',
            'media' => 'anime',
            'format' => 'TV',
            'status' => 'FINISHED',
            'episode_count' => 2,
        ]);

        // Cria 2 episódios com duração de 24 min (1440s) cada
        // Limiar de qualificação: >= 1440 - 300 = 1140 segundos
        $ep1 = 'ep-fan-01';
        $ep2 = 'ep-fan-02';
        DB::table('catalog_entities')->insert([
            ['id' => $ep1, 'kind' => 'episode', 'resolution_status' => 'verified', 'created_at' => now(), 'updated_at' => now()],
            ['id' => $ep2, 'kind' => 'episode', 'resolution_status' => 'verified', 'created_at' => now(), 'updated_at' => now()],
        ]);
        DB::table('catalog_episodes')->insert([
            [
                'id' => $ep1,
                'work_id' => $workId,
                'number' => 1,
                'numbering_scheme' => 'original',
                'air_date_utc' => '2026-01-01 00:00:00',
            ],
            [
                'id' => $ep2,
                'work_id' => $workId,
                'number' => 2,
                'numbering_scheme' => 'original',
                'air_date_utc' => '2026-01-08 00:00:00',
            ],
        ]);

        $evaluator = app(EntityFanTierEvaluator::class);

        // 1. Sem interações completas, o tier deve ser 0
        $result = $evaluator->evaluateWork($user, $workId);
        $this->assertEquals(0, $result['tier']);
        $this->assertFalse($result['interactions_complete']);

        // 2. Preenche apenas curtir e favoritar
        DB::table('user_entity_preferences')->insert([
            'user_id' => $user->id,
            'entity_id' => $workId,
            'target_id' => $workId,
            'target_type' => 'work',
            'liked' => true,
            'bookmarked' => true,
            'user_score' => 0,
            'created_at' => now(),
        ]);

        $result = $evaluator->evaluateWork($user, $workId);
        $this->assertFalse($result['interactions_complete']);

        // 3. Adiciona Nota e Comentário (agora as 4 interações estão presentes)
        DB::table('user_entity_preferences')->where('user_id', $user->id)->where('entity_id', $workId)->update([
            'user_score' => 10,
        ]);
        DB::table('entity_discussions')->insert([
            'user_id' => $user->id,
            'entity_id' => $workId,
            'target_type' => 'work',
            'target_id' => $workId,
            'comment_body' => 'Excelente animação!',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Ainda 0% assistido
        $result = $evaluator->evaluateWork($user, $workId);
        $this->assertTrue($result['interactions_complete']);
        $this->assertEquals(0.0, $result['completion_percentage']);
        $this->assertEquals(0, $result['tier']);

        // 4. Usuário assiste ep1 mas apenas por 500s (menos de 1440 - 300 = 1140s) -> Não qualifica
        DB::table('user_entity_preferences')->insert([
            'user_id' => $user->id,
            'entity_id' => $ep1,
            'target_id' => $ep1,
            'target_type' => 'episode',
            'status' => 'watching',
            'progress_seconds' => 500,
            'created_at' => now(),
        ]);
        $result = $evaluator->evaluateWork($user, $workId);
        $this->assertEquals(0, $result['qualifying_episodes']);
        $this->assertEquals(0, $result['tier']);

        // 5. Usuário avança ep1 para 1200s (>= 1140s = qualificado) -> 1 de 2 episódios = 50%
        DB::table('user_entity_preferences')->where('user_id', $user->id)->where('entity_id', $ep1)->update([
            'progress_seconds' => 1200,
        ]);
        $result = $evaluator->evaluateWork($user, $workId);
        $this->assertEquals(1, $result['qualifying_episodes']);
        $this->assertEquals(50.0, $result['completion_percentage']);
        $this->assertEquals(2, $result['tier']); // 50% = Tier 2 (Entusiasta)
        $this->assertEquals('Entusiasta de Bleach: Sennen Kessen-hen', $result['dynamic_title']);
        $this->assertEquals(150, $result['xp_granted']); // Tier 1 (50) + Tier 2 (100) = 150 XP

        // 6. Imutabilidade do XP: Reavaliar a obra não concede o XP novamente
        $recheck = $evaluator->evaluateWork($user, $workId);
        $this->assertEquals(0, $recheck['xp_granted']);

        // 7. Usuário assiste ep2 marcando como concluído -> 100% (Tier 4 Mestre)
        DB::table('user_entity_preferences')->insert([
            'user_id' => $user->id,
            'entity_id' => $ep2,
            'target_id' => $ep2,
            'target_type' => 'episode',
            'status' => 'completed',
            'progress_seconds' => 1400,
            'created_at' => now(),
        ]);
        $final = $evaluator->evaluateWork($user, $workId);
        $this->assertEquals(2, $final['qualifying_episodes']);
        $this->assertEquals(100.0, $final['completion_percentage']);
        $this->assertEquals(4, $final['tier']); // Tier 4 (Mestre)
        $this->assertEquals('Mestre Soberano de Bleach: Sennen Kessen-hen', $final['dynamic_title']);
        $this->assertEquals(750, $final['xp_granted']); // Tier 3 (250) + Tier 4 (500) = 750 XP novos
    }
}
