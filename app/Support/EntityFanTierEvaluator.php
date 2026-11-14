<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class EntityFanTierEvaluator
{
    /**
     * Requisitos de cada marco de Fã:
     * - Todas as 4 interações ativas: Like (curtir), Bookmark (favoritar), Rating (nota), Comment (ao menos 1 comentário)
     * - Tempo de exibição de cada episódio qualificado: duração total menos 5 minutos (300 segundos)
     */
    public const TIER_REWARDS = [
        1 => ['pct' => 25.0, 'xp' => 50, 'suffix' => 'Conhecedor', 'key' => 'tier_1'],
        2 => ['pct' => 50.0, 'xp' => 100, 'suffix' => 'Entusiasta', 'key' => 'tier_2'],
        3 => ['pct' => 80.0, 'xp' => 250, 'suffix' => 'Fã Devoto', 'key' => 'tier_3'],
        4 => ['pct' => 100.0, 'xp' => 500, 'suffix' => 'Mestre Soberano', 'key' => 'tier_4'],
    ];

    /**
     * Avalia e atualiza o estado de fã de uma obra para o usuário.
     * Retorna os dados do estado de fã e qualquer XP recém-conquistado.
     */
    public function evaluateWork(User $user, string $workId): array
    {
        $work = DB::table('catalog_works')->where('id', $workId)->first();
        if (! $work) {
            return ['status' => 'not_found'];
        }

        // 1. Interações diretas com a Obra (Like, Bookmark, Rating)
        $pref = DB::table('user_entity_preferences')
            ->where('user_id', $user->id)
            ->where('entity_id', $workId)
            ->first();

        $hasLiked = (bool) ($pref?->liked ?? false);
        $hasBookmarked = (bool) ($pref?->bookmarked ?? false);
        $hasRated = ((int) ($pref?->user_score ?? 0)) > 0;

        // Comentários na Obra
        $hasCommented = DB::table('entity_discussions')
            ->where('user_id', $user->id)
            ->where('entity_id', $workId)
            ->exists();

        $allInteractionsComplete = $hasLiked && $hasBookmarked && $hasRated && $hasCommented;

        // 2. Episódios Lançados e Validação de Tempo (Duração total menos 5 minutos = 300s)
        $episodes = DB::table('catalog_episodes')
            ->where('work_id', $workId)
            ->where('numbering_scheme', 'original')
            ->get();

        $now = now()->timestamp;
        $releasedEpisodes = $episodes->filter(function ($ep) use ($work, $now) {
            if ($ep->air_date_utc !== null) {
                $t = strtotime($ep->air_date_utc);
                return $t !== false && $t <= $now;
            }
            return $work->status === 'FINISHED';
        });

        $totalReleased = $releasedEpisodes->count();

        // Busca o histórico de progresso de cada episódio do usuário
        $epIds = $releasedEpisodes->pluck('id')->all();
        $userEpPrefs = DB::table('user_entity_preferences')
            ->where('user_id', $user->id)
            ->where('target_type', 'episode')
            ->whereIn('entity_id', $epIds)
            ->get()
            ->keyBy('entity_id');

        $qualifyingWatched = 0;
        foreach ($releasedEpisodes as $ep) {
            $userPref = $userEpPrefs->get($ep->id);
            if (! $userPref) {
                continue;
            }

            // Duração do episódio ou fallback padrão de anime (24 min = 1440s)
            $durationSec = (int) ($ep->duration_seconds ?? 1440);
            if ($durationSec <= 0) {
                $durationSec = 1440;
            }

            // Regra: Assistir ao menos o tempo total menos 5 minutos (300 segundos)
            $requiredThreshold = max(60, $durationSec - 300);
            $watchedSec = (int) ($userPref->progress_seconds ?? 0);

            if ($userPref->status === 'completed' || $watchedSec >= $requiredThreshold) {
                $qualifyingWatched++;
            }
        }

        // Calcula porcentagem exata com a realidade viva do catálogo
        $completionPct = $totalReleased > 0 ? min(100.0, ($qualifyingWatched / $totalReleased) * 100.0) : 0.0;

        // 3. Determina o Tier Elegível
        $eligibleTier = 0;
        $workTitle = $work->title ?: 'Obra';

        // Só pode receber tier de fã se tiver feito TODAS as 4 interações de fã na entidade
        if ($allInteractionsComplete && $totalReleased > 0) {
            foreach (self::TIER_REWARDS as $tierNum => $cfg) {
                if ($completionPct >= $cfg['pct']) {
                    $eligibleTier = $tierNum;
                }
            }
        }

        $dynamicTitle = null;
        if ($eligibleTier > 0) {
            $dynamicTitle = self::TIER_REWARDS[$eligibleTier]['suffix'] . ' de ' . $workTitle;
        }

        // 4. Concessão de XP Imutável (Apenas 1 vez por marco histórico)
        $newlyGrantedXp = 0;
        if ($eligibleTier > 0) {
            for ($t = 1; $t <= $eligibleTier; $t++) {
                $reward = self::TIER_REWARDS[$t];
                $alreadyClaimed = DB::table('user_achievement_claims')
                    ->where('user_id', $user->id)
                    ->where('entity_kind', 'work')
                    ->where('entity_id', $workId)
                    ->where('milestone_tier', $reward['key'])
                    ->exists();

                if (! $alreadyClaimed) {
                    DB::table('user_achievement_claims')->insert([
                        'user_id' => $user->id,
                        'entity_kind' => 'work',
                        'entity_id' => $workId,
                        'milestone_tier' => $reward['key'],
                        'xp_granted' => $reward['xp'],
                        'claimed_at' => now(),
                    ]);
                    $newlyGrantedXp += $reward['xp'];
                }
            }
        }

        if ($newlyGrantedXp > 0) {
            $user->streak_xp = (int) ($user->streak_xp ?? 0) + $newlyGrantedXp;
            $user->saveQuietly();
        }

        // 5. Atualiza o estado dinâmico (título pode entrar, rebaixar ou sair)
        DB::table('user_entity_fan_states')->updateOrInsert(
            [
                'user_id' => $user->id,
                'entity_kind' => 'work',
                'entity_id' => $workId,
            ],
            [
                'current_tier' => $eligibleTier,
                'completion_percentage' => round($completionPct, 2),
                'has_liked' => $hasLiked,
                'has_bookmarked' => $hasBookmarked,
                'has_rated' => $hasRated,
                'has_commented' => $hasCommented,
                'episodes_watched_qualifying' => $qualifyingWatched,
                'total_released_episodes' => $totalReleased,
                'dynamic_title' => $dynamicTitle,
                'updated_at' => now(),
            ]
        );

        return [
            'tier' => $eligibleTier,
            'completion_percentage' => round($completionPct, 2),
            'qualifying_episodes' => $qualifyingWatched,
            'total_episodes' => $totalReleased,
            'interactions_complete' => $allInteractionsComplete,
            'dynamic_title' => $dynamicTitle,
            'xp_granted' => $newlyGrantedXp,
        ];
    }
}
