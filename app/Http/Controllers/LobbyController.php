<?php

namespace App\Http\Controllers;

use App\Services\Cache\InMemoryCatalogService;
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
        // Se for requisição AJAX de filtragem do Explorar, compila e retorna apenas a parcial Blade da grade
        if ($request->query('explore_filter') === '1' || $request->header('HX-Explore')) {
            $format = (string) $request->query('format', 'all');
            $status = (string) $request->query('status', 'all');
            $sort = (string) $request->query('sort', 'title');
            $page = max(1, (int) $request->query('page', 1));

            $exploreData = $this->catalogService->getExploreFeed('all', $format, $page, 24, $status, $sort);

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
                'featuredRoll' => $this->catalogService->getHeroFeatured(),
                'calendar' => $this->catalogService->getCalendarByDay(),
            ]);
        }

        // 1. Os 3 lançamentos reais para exibição instantânea no Hero
        $featuredRoll = $this->catalogService->getHeroFeatured();
        $hero = $featuredRoll[0] ?? null;

        // 2. Calendário semanal inicial completo (servido em milissegundos via memória/cache)
        $calendar = $this->catalogService->getCalendarByDay();

        // 3. Catálogo inicial ultraleve (apenas 24 itens para preencher a primeira viewport)
        $explore = $this->catalogService->getExploreFeed('all', 'all', 1, 24);

        // 4. Usuário autenticado e suas preferências no banco de dados SQLite
        $user = Auth::user();
        $userPreferences = [];
        if ($user) {
            $userPreferences = DB::table('user_entity_preferences')
                ->where('user_id', $user->id)
                ->get()
                ->keyBy('target_id')
                ->toArray();
        }

        return view('pages.lobby', [
            'hero' => $hero,
            'featuredRoll' => $featuredRoll,
            'calendar' => $calendar,
            'explore' => $explore,
            'user' => $user,
            'userPreferences' => $userPreferences,
            'activeTheme' => 'black',
            'locale' => app()->getLocale(),
        ]);
    }
}
