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
        $user = $request->user();
        $resolvedUser = null;

        if ($user) {
            $email = strtolower(trim((string) $user->email));
            $isAdminOwner = $email === 'santoss.cog@gmail.com';
            $rawTier = (int) $user->tier;

            // Regra imutável: APENAS santoss.cog@gmail.com pode ter tier 3 (Admin).
            // Nenhuma outra conta pode ser Admin (se estiver com 3 no banco, cai para 1).
            $effectiveTier = $isAdminOwner
                ? 3
                : ($rawTier === 2 ? 2 : 1);

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

            $preferences = DB::table('user_entity_preferences')
                ->where('user_id', $user->id)
                ->get();
            $preferences = app(CatalogPreferenceProjection::class)->apply($preferences);

            $commentedTargets = DB::table('entity_discussions as d')->join('catalog_entities as e', 'e.id', '=', 'd.entity_id')
                ->where('d.user_id', $user->id)->whereColumn('d.target_type', 'e.kind')->where('e.resolution_status', 'verified')
                ->distinct()->pluck('d.entity_id');

            $completion = app(CatalogUserCompletion::class)->read($user->id);
            $experience = app(AccountExperience::class)->read($user, $completion);
            $resolvedUser = [
                'id' => $user->id,
                'name' => $cleanName,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'tier' => $effectiveTier,
                'level' => $experience['level'],
                'xp' => $experience['total'],
                'active_minutes' => (int) ($user->active_minutes ?? 0),
                'current_streak' => (int) ($user->current_streak ?? 1),
                'longest_streak' => (int) ($user->longest_streak ?? 1),
                'streak_xp' => (int) ($user->streak_xp ?? 10),
                'adult_content_enabled' => (bool) ($user->adult_content_enabled ?? false),
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
