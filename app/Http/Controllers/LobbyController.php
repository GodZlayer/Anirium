<?php

namespace App\Http\Controllers;

use App\Services\Cache\InMemoryCatalogService;
use App\Support\LocaleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class LobbyController extends Controller
{
    public function __construct(
        private readonly InMemoryCatalogService $catalogService
    ) {}

    public function index(Request $request): View|Response|JsonResponse
    {
        $user = Auth::user();
        $allowAdult = (bool) $user?->canAccessAdultContent();
        $uiLocale = app(LocaleResolver::class)->resolveFromRequest($request);

        // Se for requisição AJAX de filtragem do Explorar, compila e retorna apenas a parcial Blade da grade
        if ($request->query('explore_filter') === '1' || $request->header('HX-Explore')) {
            $format = (string) $request->query('format', 'all');
            $status = (string) $request->query('status', 'all');
            $sort = (string) $request->query('sort', 'title');
            $page = max(1, (int) $request->query('page', 1));

            $exploreData = $this->catalogService->getExploreFeed('all', $format, $page, 24, $status, $sort, $allowAdult);

            return response()->view('partials.explore-grid', [
                'items' => $exploreData['items'],
                'total' => $exploreData['total'],
                'page' => $exploreData['page'],
                'lastPage' => $exploreData['last_page'],
            ]);
        }

        // Endpoint JSON para carregamento assíncrono interno da tela (Hero Roll e Calendário Completo)
        if ($request->expectsJson() || $request->query('feed') === 'init') {
            return response()->json([
                'featuredRoll' => $this->catalogService->getHeroFeatured($allowAdult, $uiLocale),
                'calendar' => $this->catalogService->getCalendarByDay($allowAdult),
            ]);
        }

        // 1. Os 3 lançamentos reais para exibição instantânea no Hero
        $featuredRoll = $this->catalogService->getHeroFeatured($allowAdult, $uiLocale);
        $hero = $featuredRoll[0] ?? null;

        // 2. Calendário semanal inicial completo (servido em milissegundos via memória/cache)
        $calendar = $this->catalogService->getCalendarByDay($allowAdult);

        // 3. Catálogo inicial ultraleve (apenas 24 itens para preencher a primeira viewport)
        $explore = $this->catalogService->getExploreFeed('all', 'all', 1, 24, 'all', 'title', $allowAdult);

        // 4. Usuário autenticado e suas preferências no banco de dados SQLite
        $userPreferences = [];
        $frontendUser = null;
        if ($user) {
            $userPreferences = DB::table('user_entity_preferences')
                ->where('user_id', $user->id)
                ->get()
                ->keyBy('target_id')
                ->toArray();

            $frontendUser = [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'tier' => (int) $user->tier,
                'level' => (int) ($user->level ?? 1),
                'xp' => (int) ($user->xp ?? 0),
                'active_minutes' => (int) ($user->active_minutes ?? 0),
                'current_streak' => (int) ($user->current_streak ?? 0),
                'longest_streak' => (int) ($user->longest_streak ?? 0),
                'streak_xp' => (int) ($user->streak_xp ?? 0),
                'bytes_uploaded' => (int) ($user->bytes_uploaded ?? 0),
                'bytes_downloaded' => (int) ($user->bytes_downloaded ?? 0),
                'seeding_seconds' => (int) ($user->seeding_seconds ?? 0),
                'seeding_xp' => (int) ($user->seeding_xp ?? 0),
                'adult_content_enabled' => $allowAdult,
                'age_verified' => $user->isAgeVerified(),
                'age_verification_status' => (string) ($user->age_verification_status ?? 'unverified'),
                'age_verification_method' => $user->age_verification_method,
                'age_verification_note' => $user->age_verification_note,
                'is_admin' => $user->isAdmin(),
                'custom_title' => $user->custom_title,
            ];
        }

        return response()->view('pages.lobby', [
            'hero' => $hero,
            'featuredRoll' => $featuredRoll,
            'calendar' => $calendar,
            'explore' => $explore,
            'user' => $user,
            'frontendUser' => $frontendUser,
            'userPreferences' => $userPreferences,
            'activeTheme' => 'black',
            'locale' => app()->getLocale(),
        ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache');
    }
}
