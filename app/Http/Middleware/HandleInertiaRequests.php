<?php

namespace App\Http\Middleware;

use App\Http\Controllers\TelemetryDeviceController;
use App\Support\AccountExperience;
use App\Support\CatalogPreferenceProjection;
use App\Support\CatalogUserCompletion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        if ($request->is('api/*')) {
            return parent::share($request);
        }

        $user = $request->user();
        $resolvedUser = null;

        if ($user) {
            $email = strtolower(trim((string) $user->email));
            $isAdminOwner = $email === 'santoss.cog@gmail.com';
            $rawTier = (int) $user->tier;

            // Regra imutável: APENAS santoss.cog@gmail.com pode ter tier 3 (Admin).
            // Nenhuma outra conta pode ser Admin (se estiver com 3 no banco, cai para 1).
            // Se o período de teste/assinatura do Anirium+ expirou, volta para tier 1.
            $plusExpired = $rawTier === 2
                && $user->anirium_plus_expires_at !== null
                && $user->anirium_plus_expires_at->isPast();

            $effectiveTier = $isAdminOwner
                ? 3
                : ($rawTier === 2 && ! $plusExpired ? 2 : 1);

            if ($rawTier !== $effectiveTier) {
                $user->tier = $effectiveTier;
                $user->saveQuietly();
            }

            // Avalia presença diária e streaks (1 dia, 1 semana, 1 mês, 1 ano)
            TelemetryDeviceController::evaluateDailyStreak($user);

            $cleanName = trim((string) $user->name);
            if ($cleanName === '' || strtolower($cleanName) === 'visitante') {
                $cleanName = explode('@', (string) $user->email)[0] ?: 'Membro';
            }

            $isPlus = $user->hasActiveAniriumPlus();
            $preferences = [];
            $commentedTargets = [];

            if ($isPlus) {
                $preferences = DB::table('user_entity_preferences')
                    ->where('user_id', $user->id)
                    ->get();
                $preferences = app(CatalogPreferenceProjection::class)->apply($preferences);

                $commentedTargets = DB::table('entity_discussions as d')->join('catalog_entities as e', 'e.id', '=', 'd.entity_id')
                    ->where('d.user_id', $user->id)->whereColumn('d.target_type', 'e.kind')->where('e.resolution_status', 'verified')
                    ->distinct()->pluck('d.entity_id');
            }

            $dbAddons = DB::table('user_addons')->where('user_id', $user->id)->get();
            $hasPlayerAddon = false;
            if ($isPlus) {
                $playerProRecord = $dbAddons->firstWhere('addon_id', 'player-pro');
                if (! $playerProRecord || (bool) $playerProRecord->enabled) {
                    $hasPlayerAddon = true;
                }
            }
            if (! $hasPlayerAddon) {
                foreach ($dbAddons as $addon) {
                    if (in_array($addon->addon_id, ['player-pro', 'manga-reader-pro'], true) || ! (bool) $addon->enabled) {
                        continue;
                    }
                    $manifest = ! empty($addon->manifest_json) ? json_decode($addon->manifest_json, true) : null;
                    $caps = is_array($manifest['capabilities'] ?? null) ? $manifest['capabilities'] : [];
                    $category = $manifest['category'] ?? null;
                    $mediaType = $manifest['mediaType'] ?? null;
                    if (($category === 'engine.renderer' && ($mediaType === 'video' || ! $mediaType)) || in_array('ui.player.render', $caps, true)) {
                        $hasPlayerAddon = true;
                        break;
                    }
                }
            }

            $completion = app(CatalogUserCompletion::class)->read($user->id);
            $experience = app(AccountExperience::class)->read($user, $completion);
            $resolvedUser = [
                'id' => $user->id,
                'name' => $cleanName,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'tier' => $effectiveTier,
                'has_player_addon' => $hasPlayerAddon,
                'anirium_plus_expires_at' => $user->anirium_plus_expires_at?->toIso8601String(),
                'anirium_plus_trial_claimed' => $user->anirium_plus_trial_claimed_at !== null,
                'level' => $experience['level'],
                'xp' => $experience['total'],
                'active_minutes' => (int) ($user->active_minutes ?? 0),
                'current_streak' => (int) ($user->current_streak ?? 1),
                'longest_streak' => (int) ($user->longest_streak ?? 1),
                'streak_xp' => (int) ($user->streak_xp ?? 10),
                'adult_content_enabled' => $user->canAccessAdultContent(),
                'age_verified' => $user->isAgeVerified(),
                'age_verification_status' => (string) ($user->age_verification_status ?? 'unverified'),
                'age_verification_method' => $user->age_verification_method,
                'custom_title' => $user->custom_title,
                'preferences' => $preferences,
                'commented_targets' => $commentedTargets,
                'catalog_completion' => $completion,
            ];
        }

        return [
            ...parent::share($request),
            'auth' => [
                'user' => $resolvedUser,
            ],
        ];
    }
}
