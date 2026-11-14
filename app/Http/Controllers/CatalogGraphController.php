<?php

namespace App\Http\Controllers;

use App\Support\CatalogContextLookup;
use App\Support\CatalogGraphVisibility;
use App\Support\CatalogSearch;
use App\Support\CatalogUnavailable;
use App\Support\CatalogWorkGraph;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class CatalogGraphController extends Controller
{
    private function resolveUuid(string $id, string $kind = 'work'): ?string
    {
        $cleanId = preg_replace('/\.0$/', '', trim($id));

        // 1. Se já for um UUID v4 legítimo e existir na tabela principal, retorna em 1ms
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $cleanId)) {
            if ($kind === 'work' || $kind === 'manga') {
                return Cache::remember("catalog:resolve:uuid:{$kind}:{$cleanId}", 86400, function () use ($cleanId) {
                    $isWork = DB::table('catalog_works')->where('id', $cleanId)->exists();
                    if ($isWork) {
                        return $cleanId;
                    }

                    // Se o UUID pertencer a um episódio ou arco, redireciona para a obra
                    $epWorkId = DB::table('catalog_episodes')->where('id', $cleanId)->value('work_id');
                    if ($epWorkId) {
                        return $epWorkId;
                    }
                    $arcWorkId = DB::table('catalog_arc_works')->where('arc_id', $cleanId)->value('work_id');
                    if ($arcWorkId) {
                        return $arcWorkId;
                    }

                    return $cleanId;
                });
            }

            return $cleanId;
        }

        // 2. Se for external ID (ex: MyAnimeList ID, AniList ID, Shikimori ID), busca no índice com cache
        return Cache::remember("catalog:resolve:ext:{$kind}:{$cleanId}", 86400, function () use ($cleanId, $kind) {
            $query = DB::table('catalog_external_identities')
                ->where('external_id', $cleanId);

            if ($kind === 'manga') {
                $query->where('namespace', 'like', 'manga%')
                    ->orderByRaw("CASE WHEN provider = 'mal' THEN 1 WHEN provider = 'shikimori' THEN 2 WHEN provider = 'anilist' THEN 3 ELSE 4 END");
            } elseif ($kind === 'work' || $kind === 'anime') {
                $query->where('namespace', 'like', 'anime%')
                    ->orderByRaw("CASE WHEN provider = 'mal' THEN 1 WHEN provider = 'shikimori' THEN 2 WHEN provider = 'anilist' THEN 3 ELSE 4 END");
            }

            $ext = $query->value('entity_id');
            if ($ext) {
                return $ext;
            }

            // Fallback amplo caso não encontre no namespace restrito
            $fallbackExt = DB::table('catalog_external_identities')
                ->where('external_id', $cleanId)
                ->value('entity_id');
            if ($fallbackExt) {
                return $fallbackExt;
            }

            // 3. Fallback: busca por prefixo se não for UUID
            if (($kind === 'work' || $kind === 'manga') && strlen($cleanId) >= 3) {
                $workId = DB::table('catalog_works')
                    ->where('id', 'like', "{$cleanId}%")
                    ->value('id');
                if ($workId) {
                    return $workId;
                }
            }

            return $cleanId;
        });
    }

    private function resolveCanonicalUniverseName(string $universeId, ?string $fallbackWorkTitle = null): string
    {
        $canonicalTitle = DB::table('catalog_entity_titles')
            ->where('entity_id', $universeId)
            ->whereIn('locale', ['pt-BR', 'und', 'en'])
            ->orderByRaw("CASE WHEN locale = 'pt-BR' THEN 1 WHEN locale = 'und' THEN 2 ELSE 3 END")
            ->value('title');

        if ($canonicalTitle) {
            return $canonicalTitle;
        }

        $translatedTitle = DB::table('catalog_translations')
            ->where('entity_id', $universeId)
            ->where('field', 'title')
            ->whereIn('locale', ['pt-BR', 'romaji', 'en', 'und'])
            ->value('value');

        if ($translatedTitle) {
            return $translatedTitle;
        }

        if ($fallbackWorkTitle) {
            return $fallbackWorkTitle;
        }

        $firstWorkTitle = DB::table('catalog_universe_works as uw')
            ->join('catalog_works as w', 'uw.work_id', '=', 'w.id')
            ->where('uw.universe_id', $universeId)
            ->value('w.title');

        return $firstWorkTitle ?: 'Universo Canônico';
    }

    public function context(Request $request, string $kind, string $id, CatalogContextLookup $lookup): JsonResponse
    {
        $input = $request->validate(['work_id' => ['sometimes', 'string', 'uuid']]);
        $id = $this->resolveUuid($id, $kind);
        try {
            $result = $lookup->resolve($kind, $id, (bool) $request->user()?->adult_content_enabled, $input['work_id'] ?? null);

            return $result ? response()->json($result) : response()->json(['error' => 'entity_not_found'], 404);
        } catch (CatalogUnavailable) {
            return response()->json(['error' => 'catalog_graph_unavailable'], 503);
        }
    }

    public function work(Request $request, string $id, CatalogWorkGraph $graph): JsonResponse|Response
    {
        try {
            $kind = $request->query('kind', 'work');
            $realId = $this->resolveUuid($id, $kind);
            $allowAdult = (bool) (
                $request->user()?->adult_content_enabled ||
                in_array($request->query('adult'), ['1', 'true', true], true)
            );

            // Cache atômico em memória para o grafo estático da obra (reduz de 6s para 0ms)
            $res = $graph->read($realId, $allowAdult);
            if (! $res) {
                return response()->json(['error' => 'entity_not_found'], 404);
            }

            $metaKey = "catalog:work:graph:meta:v5:{$realId}";
            $meta = Cache::remember($metaKey, 3600, function () use ($realId, $res) {
                $workRow = DB::table('catalog_works')->where('id', $realId)->first();
                $synopsis = DB::table('catalog_translations')
                    ->where('entity_id', $realId)
                    ->where('field', 'synopsis')
                    ->whereIn('locale', ['pt-BR', 'en', 'und'])
                    ->orderByRaw("CASE WHEN locale = 'pt-BR' THEN 1 WHEN locale = 'en' THEN 2 ELSE 3 END")
                    ->value('value');

                // Injetar relações de Universo Canônico
                $universeWork = DB::table('catalog_universe_works')
                    ->where('work_id', $realId)
                    ->first();
                $universeData = null;
                if ($universeWork) {
                    $u = DB::table('catalog_universes')->where('id', $universeWork->universe_id)->first();
                    if ($u) {
                        $universeData = [
                            'id' => $u->id,
                            'name' => $this->resolveCanonicalUniverseName($u->id, $res['entity']['title'] ?? null),
                        ];
                    }
                }

                // Injetar relações de Criadores, Estúdios e Trilhas da malha pura
                $creators = DB::table('catalog_work_creators as wc')
                    ->join('catalog_creators as c', 'wc.creator_id', '=', 'c.id')
                    ->join('catalog_roles as r', 'wc.role_id', '=', 'r.id')
                    ->where('wc.work_id', $realId)
                    ->get(['c.id', 'c.name', 'c.native_name', 'c.image_url', 'r.token as role'])
                    ->toArray();

                $studios = DB::table('catalog_work_studios as ws')
                    ->join('catalog_studios as s', 'ws.studio_id', '=', 's.id')
                    ->where('ws.work_id', $realId)
                    ->get(['s.id', 's.name', 's.image_url'])
                    ->toArray();

                $tracks = DB::table('catalog_work_tracks as wt')
                    ->join('catalog_tracks as t', 'wt.track_id', '=', 't.id')
                    ->leftJoin('catalog_creators as c', 't.composer_id', '=', 'c.id')
                    ->where('wt.work_id', $realId)
                    ->get(['t.id', 't.title', 't.track_type', 'c.name as composer_name', 'c.id as composer_id'])
                    ->toArray();

                // Identidades externas para resolução aberta de Addons (MAL, AniList, Shikimori, IMDb)
                $externalIds = DB::table('catalog_external_identities')
                    ->where('entity_id', $realId)
                    ->select('provider', 'external_id', 'namespace')
                    ->get()
                    ->toArray();

                $image = DB::table('catalog_work_assets')->where('work_id', $realId)->value('image_url');

                return json_decode(json_encode([
                    'workRow' => $workRow,
                    'synopsis' => $synopsis,
                    'universe' => $universeData,
                    'creators' => $creators,
                    'studios' => $studios,
                    'tracks' => $tracks,
                    'external_ids' => $externalIds,
                    'image_url' => $image,
                ]), true);
            });

            if (! empty($meta['workRow'])) {
                $workRow = $meta['workRow'];
                $res['entity']['media'] = $workRow['media'] ?? ($res['entity']['media'] ?? 'anime');
                $res['entity']['format'] = $workRow['format'] ?? ($res['entity']['format'] ?? 'TV');
                $res['entity']['status'] = $workRow['status'] ?? ($res['entity']['status'] ?? 'COMPLETED');
                $res['entity']['episode_count'] = $workRow['episode_count'] ?? ($res['entity']['episode_count'] ?? null);
            }
            if (empty($res['entity']['synopsis']) && ! empty($meta['synopsis'])) {
                $res['entity']['synopsis'] = $meta['synopsis'];
            }
            if (! empty($meta['image_url'])) {
                $res['entity']['image_url'] = $meta['image_url'];
            }

            $res['creators'] = $meta['creators'] ?? [];
            $res['studios'] = $meta['studios'] ?? [];
            $res['tracks'] = $meta['tracks'] ?? [];
            $res['universe'] = $meta['universe'] ?? null;
            $res['external_ids'] = $meta['external_ids'] ?? [];

            $result = json_decode(json_encode($res), true);

            $creators = collect($result['creators'] ?? [])->map(fn ($c) => (object) $c);
            $studios = collect($result['studios'] ?? [])->map(fn ($s) => (object) $s);
            $tracks = collect($result['tracks'] ?? [])->map(fn ($t) => (object) $t);
            $relations = collect($result['relations'] ?? [])->map(fn ($r) => (object) $r);
            $externalIds = collect($result['external_ids'] ?? [])->map(fn ($e) => (object) $e);
            $universe = ! empty($result['universe']) ? (object) $result['universe'] : null;

            // Se for requisição pedindo HTML/Blade ou HTMX, retorna a view compilada diretamente pelo PHP
            if ($request->query('render') === 'blade' || $request->header('HX-Request') || ! $request->expectsJson()) {
                $user = $request->user();
                $pref = null;
                if ($user) {
                    $pref = DB::table('user_entity_preferences')
                        ->where('user_id', $user->id)
                        ->where('target_id', $realId)
                        ->first();
                }

                $workObj = (object) ($result['entity'] ?? []);
                $arcsObj = collect($result['arcs'] ?? [])->map(fn ($a) => (object) $a);
                $episodesObj = collect($result['episodes'] ?? [])->map(fn ($e) => (object) $e);

                return response()->view('partials.context-card', [
                    'work' => $workObj,
                    'universe' => $universe,
                    'creators' => $creators,
                    'studios' => $studios,
                    'tracks' => $tracks,
                    'relations' => $relations,
                    'externalIds' => $externalIds,
                    'arcs' => $arcsObj,
                    'episodes' => $episodesObj,
                    'isLiked' => (bool) ($pref->liked ?? false),
                    'isBookmarked' => (bool) ($pref->bookmarked ?? false),
                    'userScore' => $pref->user_score ?? null,
                    'userStatus' => $pref->status ?? null,
                    'isWatched' => ($pref->status ?? '') === 'completed',
                ]);
            }

            return response()->json($result);
        } catch (CatalogUnavailable) {
            return response()->json(['error' => 'catalog_graph_unavailable'], 503);
        }
    }

    public function universe(Request $request, string $id, CatalogSearch $catalog): JsonResponse|Response
    {
        $realId = $this->resolveUuid($id, 'universe');
        $allowAdult = (bool) ($request->user()?->adult_content_enabled || $request->query('adult') === '1');

        $universeRow = DB::table('catalog_universes')->where('id', $realId)->first();
        if (! $universeRow) {
            return response()->json(['error' => 'entity_not_found'], 404);
        }

        $allWorkIds = DB::table('catalog_universe_works')->where('universe_id', $realId)->pluck('work_id')->all();
        $visibility = app(CatalogGraphVisibility::class);
        $visibleWorkIds = $visibility->works($allWorkIds, $allowAdult);
        sort($visibleWorkIds, SORT_STRING);

        $cacheKey = "catalog:universe:graph:payload:v9:{$realId}:".($allowAdult ? '1' : '0');
        $data = Cache::remember($cacheKey, 3600, function () use ($realId, $universeRow, $allWorkIds, $visibleWorkIds) {
            $universe = clone $universeRow;
            $safeWorkIds = $allWorkIds ?: ['00000000-0000-0000-0000-000000000000'];

            // Buscar todas as obras vinculadas a este universo
            $works = DB::table('catalog_universe_works as uw')
                ->join('catalog_works as w', 'uw.work_id', '=', 'w.id')
                ->leftJoin('catalog_work_assets as wa', 'w.id', '=', 'wa.work_id')
                ->where('uw.universe_id', $realId)
                ->where('w.media', 'anime')
                ->get(['w.id', 'w.title', 'w.format', 'w.status', 'w.episode_count', 'wa.image_url']);

            $universe->name = $this->resolveCanonicalUniverseName($realId, $works[0]->title ?? null);

            // Buscar autores com distinção explícita de autor original vs roteirista/autor derivado
            $authors = DB::table('catalog_work_creators as wc')
                ->join('catalog_creators as c', 'wc.creator_id', '=', 'c.id')
                ->leftJoin('catalog_roles as r', 'wc.role_id', '=', 'r.id')
                ->whereIn('wc.work_id', $safeWorkIds)
                ->whereIn('r.token', ['author', 'writer'])
                ->select(
                    'c.id',
                    'c.name',
                    'c.image_url',
                    DB::raw("MIN(CASE WHEN r.token = 'author' THEN 1 ELSE 2 END) as is_original"),
                    DB::raw('COUNT(DISTINCT wc.work_id) as total_works')
                )
                ->groupBy('c.id', 'c.name')
                ->orderByDesc('total_works')
                ->take(6)
                ->get();

            // Buscar estúdios de animação da franquia com contagem de produções
            $studios = DB::table('catalog_work_studios as ws')
                ->join('catalog_studios as s', 'ws.studio_id', '=', 's.id')
                ->whereIn('ws.work_id', $safeWorkIds)
                ->select(
                    's.id',
                    's.name',
                    's.image_url',
                    DB::raw('COUNT(ws.work_id) as total_works')
                )
                ->groupBy('s.id', 's.name')
                ->orderByDesc('total_works')
                ->take(4)
                ->get();

            // Formatos presentes no universo
            $formats = DB::table('catalog_works')
                ->whereIn('id', $safeWorkIds)
                ->select('format', DB::raw('COUNT(*) as total'))
                ->groupBy('format')
                ->orderByDesc('total')
                ->get();

            // Buscar trilhas sonoras em destaque
            $tracks = DB::table('catalog_work_tracks as wt')
                ->join('catalog_tracks as t', 'wt.track_id', '=', 't.id')
                ->leftJoin('catalog_works as w', 'wt.work_id', '=', 'w.id')
                ->whereIn('wt.work_id', $safeWorkIds)
                ->select('t.id', 't.title', 't.track_type', 'w.title as work_title')
                ->distinct()
                ->take(5)
                ->get();

            // Métricas agregadas de unidades (episódios de animes, capítulos de mangás e volumes)
            $unitMetrics = DB::table('catalog_works')
                ->whereIn('id', $safeWorkIds)
                ->select(
                    DB::raw("SUM(CASE WHEN media = 'anime' THEN coalesce(episode_count, 0) ELSE 0 END) as anime_episodes"),
                    DB::raw("SUM(CASE WHEN media = 'manga' THEN coalesce(episode_count, 0) ELSE 0 END) as manga_chapters"),
                    DB::raw("SUM(CASE WHEN media = 'novel' THEN coalesce(episode_count, 0) ELSE 0 END) as novel_volumes")
                )
                ->first();

            $totalEpisodes = (int) ($unitMetrics->anime_episodes ?? 0);
            if ($totalEpisodes === 0) {
                $totalEpisodes = DB::table('catalog_episodes')->whereIn('work_id', $safeWorkIds)->count();
            }
            $totalChapters = (int) ($unitMetrics->manga_chapters ?? 0);
            $totalVolumes = (int) ($unitMetrics->novel_volumes ?? 0);

            // Poster/Lead Image da franquia
            $universeLeadImage = $works[0]->image_url ?? '/assets/icons/actions/search.png';
            foreach ($works as $w) {
                if (strcasecmp($w->title, $universe->name) === 0 && ! empty($w->image_url)) {
                    $universeLeadImage = $w->image_url;
                    break;
                }
            }
            $universe->image_url = $universeLeadImage;
            $universe->total_episodes = $totalEpisodes;

            $mangasQuery = DB::table('catalog_universe_works as uw')
                ->join('catalog_works as w', 'uw.work_id', '=', 'w.id')
                ->leftJoin('catalog_work_assets as wa', 'w.id', '=', 'wa.work_id')
                ->where('uw.universe_id', $realId)
                ->where('w.media', 'manga');
            if (! empty($visibleWorkIds)) {
                $mangasQuery->whereIn('w.id', $visibleWorkIds);
            }
            $mangas = $mangasQuery->get(['w.id', 'w.title', 'w.format', 'w.status', 'wa.image_url']);

            // Sagas & Arcos com mapeamento exato de cobertura sem subquery em catalog_seasons
            $seasonMap = DB::table('catalog_seasons')
                ->whereIn('work_id', $safeWorkIds)
                ->select('work_id', DB::raw('MIN(number) as number'))
                ->groupBy('work_id')
                ->pluck('number', 'work_id')
                ->all();

            $arcRows = DB::table('catalog_arcs as a')
                ->join('catalog_arc_works as aw', 'a.id', '=', 'aw.arc_id')
                ->join('catalog_works as w', 'aw.work_id', '=', 'w.id')
                ->where('a.universe_id', $realId)
                ->orderBy('aw.start_number')
                ->orderBy('a.title')
                ->get(['a.id', 'a.title', 'a.classification', 'aw.work_id', 'w.title as work_title', 'aw.start_number', 'aw.end_number']);

            $arcs = $arcRows->groupBy('id')->map(function ($rows) use ($seasonMap) {
                $firstRow = $rows->first();
                $lastRow = $rows->last();
                $startSeason = (int) ($seasonMap[$firstRow->work_id] ?? 1);
                $endSeason = (int) ($seasonMap[$lastRow->work_id] ?? 1);
                $startEp = $firstRow->start_number ?? 1;
                $endEp = $lastRow->end_number ?? $startEp;

                if ($firstRow->work_id === $lastRow->work_id && $startSeason === $endSeason) {
                    $spanDesc = "{$firstRow->work_title} • T{$startSeason} (Ep. {$startEp} a {$endEp})";
                } elseif ($firstRow->work_id === $lastRow->work_id) {
                    $spanDesc = "{$firstRow->work_title} • T{$startSeason} Ep. {$startEp} ➔ T{$endSeason} Ep. {$endEp}";
                } else {
                    $spanDesc = "{$firstRow->work_title} (T{$startSeason} Ep. {$startEp}) ➔ {$lastRow->work_title} (T{$endSeason} Ep. {$endEp})";
                }

                return [
                    'id' => $firstRow->id,
                    'title' => $firstRow->title,
                    'classification' => $firstRow->classification,
                    'work_title' => $firstRow->work_title,
                    'start_season' => $startSeason,
                    'start_episode' => $startEp,
                    'end_work_title' => $lastRow->work_title,
                    'end_season' => $endSeason,
                    'end_episode' => $endEp,
                    'span_description' => $spanDesc,
                ];
            })->values()->toArray();

            // Genealogia ontológica rápida usando os IDs em memória
            $genealogyRaw = DB::table('catalog_work_relations as r')
                ->join('catalog_works as w2', 'r.to_work_id', '=', 'w2.id')
                ->leftJoin('catalog_work_assets as wa', 'w2.id', '=', 'wa.work_id')
                ->whereIn('r.from_work_id', $safeWorkIds)
                ->whereIn('r.to_work_id', $safeWorkIds)
                ->where('w2.media', 'anime')
                ->whereIn('r.relation_type', ['prequel', 'sequel', 'side_story', 'spin_off', 'parent_story'])
                ->select('w2.id', 'r.relation_type', 'w2.title', 'w2.format', 'wa.image_url', 'w2.episode_count')
                ->groupBy('w2.id', 'r.relation_type')
                ->get()
                ->map(fn ($item) => (array) $item)
                ->toArray();

            return [
                'universe' => (array) $universe,
                'works' => $works->map(fn ($w) => (array) $w)->toArray(),
                'mangas' => $mangas->map(fn ($m) => (array) $m)->toArray(),
                'arcs' => $arcs,
                'genealogy' => $genealogyRaw,
                'authors' => $authors->map(fn ($a) => (array) $a)->toArray(),
                'studios' => $studios->map(fn ($s) => (array) $s)->toArray(),
                'tracks' => $tracks->map(fn ($t) => (array) $t)->toArray(),
                'formats' => $formats->map(fn ($f) => (array) $f)->toArray(),
                'totalEpisodes' => $totalEpisodes,
                'totalChapters' => $totalChapters,
                'totalVolumes' => $totalVolumes,
                'visibleWorkIds' => $visibleWorkIds,
            ];
        });

        if (! $data) {
            return response()->json(['error' => 'entity_not_found'], 404);
        }

        $universe = (object) $data['universe'];
        $works = collect($data['works'])->map(fn ($w) => (object) $w);
        $mangas = collect($data['mangas'])->map(fn ($m) => (object) $m);
        $arcs = collect($data['arcs'])->map(fn ($a) => (object) $a);
        $genealogy = collect($data['genealogy'] ?? [])->map(fn ($g) => (object) $g);
        $authors = collect($data['authors'] ?? ($data['creators'] ?? []))->map(fn ($a) => (object) $a);
        $studios = collect($data['studios'])->map(fn ($s) => (object) $s);
        $formats = collect($data['formats'] ?? [])->map(fn ($f) => (object) $f);
        $totalEpisodes = $data['totalEpisodes'] ?? 0;
        $totalChapters = $data['totalChapters'] ?? 0;
        $totalVolumes = $data['totalVolumes'] ?? 0;

        if ($request->query('render') === 'blade' || $request->header('HX-Request') || ! $request->expectsJson()) {
            $user = $request->user();
            $pref = null;
            if ($user) {
                $pref = DB::table('user_entity_preferences')
                    ->where('user_id', $user->id)
                    ->where('target_id', $realId)
                    ->first();
            }

            return response()->view('partials.entities.universe-view', [
                'universe' => $universe,
                'works' => $works,
                'mangas' => $mangas,
                'arcs' => $arcs,
                'genealogy' => $genealogy,
                'authors' => $authors,
                'studios' => $studios,
                'formats' => $formats,
                'totalEpisodes' => $totalEpisodes,
                'totalChapters' => $totalChapters,
                'totalVolumes' => $totalVolumes,
                'isLiked' => (bool) ($pref->liked ?? false),
                'isBookmarked' => (bool) ($pref->bookmarked ?? false),
                'userScore' => $pref->user_score ?? null,
                'userStatus' => $pref->status ?? null,
            ]);
        }

        return response()->json([
            'universe' => $universe,
            'work_ids' => $visibleWorkIds,
            'works' => collect($visibleWorkIds)->map(fn ($wid) => [
                'work_id' => $wid,
                'universe_identity_version' => 1,
                'universe_v2_id' => $realId,
                'universe_ids_json' => json_encode([$realId]),
            ])->all(),
            'mangas' => $mangas,
            'arcs' => $arcs,
        ]);
    }

    public function creator(Request $request, string $id): JsonResponse|Response
    {
        $realId = $this->resolveUuid($id, 'creator');

        $data = Cache::remember("catalog:creator:graph:payload:v3:{$realId}", 3600, function () use ($realId) {
            $creator = DB::table('catalog_creators')->where('id', $realId)->first();
            if (! $creator) {
                return null;
            }

            $works = DB::table('catalog_work_creators as wc')
                ->join('catalog_works as w', 'wc.work_id', '=', 'w.id')
                ->join('catalog_roles as r', 'wc.role_id', '=', 'r.id')
                ->leftJoin('catalog_work_assets as wa', 'w.id', '=', 'wa.work_id')
                ->where('wc.creator_id', $realId)
                ->select('w.id', 'w.title', 'w.media', 'w.format', 'w.status', 'w.episode_count', 'wa.image_url', 'r.token as role')
                ->get();

            $workIds = $works->pluck('id')->unique()->values()->all();
            $roles = $works->pluck('role')->unique()->values()->all();

            // Formatos das obras do criador
            $formats = DB::table('catalog_works')
                ->whereIn('id', $workIds ?: ['00000000-0000-0000-0000-000000000000'])
                ->select('format', DB::raw('COUNT(*) as total'))
                ->groupBy('format')
                ->orderByDesc('total')
                ->get();

            $totalEpisodes = (int) DB::table('catalog_works')
                ->whereIn('id', $workIds ?: ['00000000-0000-0000-0000-000000000000'])
                ->where('media', 'anime')
                ->sum('episode_count');

            // Universos conectados ao autor/diretor
            $universesRaw = DB::table('catalog_universe_works as uw')
                ->join('catalog_universes as u', 'uw.universe_id', '=', 'u.id')
                ->whereIn('uw.work_id', $workIds ?: ['00000000-0000-0000-0000-000000000000'])
                ->select('u.id', DB::raw('COUNT(DISTINCT uw.work_id) as total_works'))
                ->groupBy('u.id')
                ->orderByDesc('total_works')
                ->limit(5)
                ->get();

            $universes = $universesRaw->map(function ($u) use ($works) {
                return [
                    'id' => $u->id,
                    'name' => $this->resolveCanonicalUniverseName($u->id, $works[0]->title ?? null),
                    'total_works' => $u->total_works,
                ];
            })->toArray();

            // Estúdios parceiros frequentes
            $studios = DB::table('catalog_work_studios as ws')
                ->join('catalog_studios as s', 'ws.studio_id', '=', 's.id')
                ->whereIn('ws.work_id', $workIds ?: ['00000000-0000-0000-0000-000000000000'])
                ->select('s.id', 's.name', 's.image_url', DB::raw('COUNT(DISTINCT ws.work_id) as total_works'))
                ->groupBy('s.id', 's.name', 's.image_url')
                ->orderByDesc('total_works')
                ->limit(5)
                ->get()
                ->toArray();

            // Trilhas compostas (se for compositor)
            $tracks = DB::table('catalog_tracks as t')
                ->leftJoin('catalog_work_tracks as wt', 't.id', '=', 'wt.track_id')
                ->leftJoin('catalog_works as w', 'wt.work_id', '=', 'w.id')
                ->where('t.composer_id', $realId)
                ->select('t.id', 't.title', 't.track_type', 'w.title as work_title')
                ->limit(20)
                ->get()
                ->toArray();

            return json_decode(json_encode([
                'creator' => $creator,
                'works' => $works,
                'roles' => $roles,
                'formats' => $formats,
                'totalEpisodes' => $totalEpisodes,
                'universes' => $universes,
                'studios' => $studios,
                'tracks' => $tracks,
            ]), true);
        });

        if (! $data) {
            return response()->json(['error' => 'entity_not_found'], 404);
        }

        $creator = (object) $data['creator'];
        $works = collect($data['works'] ?? [])->map(fn ($w) => (object) $w);
        $roles = $data['roles'] ?? [];
        $formats = collect($data['formats'] ?? [])->map(fn ($f) => (object) $f);
        $universes = collect($data['universes'] ?? [])->map(fn ($u) => (object) $u);
        $studios = collect($data['studios'] ?? [])->map(fn ($s) => (object) $s);
        $tracks = collect($data['tracks'] ?? [])->map(fn ($t) => (object) $t);
        $universe = $universes->first();

        if ($request->query('render') === 'blade' || $request->header('HX-Request') || ! $request->expectsJson()) {
            $user = $request->user();
            $pref = null;
            if ($user) {
                $pref = DB::table('user_entity_preferences')
                    ->where('user_id', $user->id)
                    ->where('target_id', $realId)
                    ->first();
            }

            return response()->view('partials.entities.creator-view', [
                'creator' => $creator,
                'universe' => $universe,
                'universes' => $universes,
                'studios' => $studios,
                'tracks' => $tracks,
                'formats' => $formats,
                'totalEpisodes' => $data['totalEpisodes'] ?? 0,
                'works' => $works,
                'roles' => $roles,
                'isLiked' => (bool) ($pref->liked ?? false),
                'isBookmarked' => (bool) ($pref->bookmarked ?? false),
                'userScore' => $pref->user_score ?? null,
                'userStatus' => $pref->status ?? null,
            ]);
        }

        return response()->json([
            'creator' => $creator,
            'works' => $works,
        ]);
    }

    public function studio(Request $request, string $id): JsonResponse|Response
    {
        $realId = $this->resolveUuid($id, 'studio');

        $data = Cache::remember("catalog:studio:graph:payload:v3:{$realId}", 3600, function () use ($realId) {
            $studio = DB::table('catalog_studios')->where('id', $realId)->first();
            if (! $studio) {
                return null;
            }

            $works = DB::table('catalog_work_studios as ws')
                ->join('catalog_works as w', 'ws.work_id', '=', 'w.id')
                ->leftJoin('catalog_work_assets as wa', 'w.id', '=', 'wa.work_id')
                ->where('ws.studio_id', $realId)
                ->get(['w.id', 'w.title', 'w.media', 'w.format', 'w.status', 'w.episode_count', 'wa.image_url']);

            $workIds = $works->pluck('id')->unique()->values()->all();

            $formats = DB::table('catalog_works')
                ->whereIn('id', $workIds ?: ['00000000-0000-0000-0000-000000000000'])
                ->select('format', DB::raw('COUNT(*) as total'))
                ->groupBy('format')
                ->orderByDesc('total')
                ->get();

            $totalEpisodes = (int) $works->sum(fn ($w) => (int) ($w->episode_count ?? 0));

            // Universos produzidos pelo estúdio
            $universesRaw = DB::table('catalog_universe_works as uw')
                ->join('catalog_universes as u', 'uw.universe_id', '=', 'u.id')
                ->whereIn('uw.work_id', $workIds ?: ['00000000-0000-0000-0000-000000000000'])
                ->select('u.id', DB::raw('COUNT(DISTINCT uw.work_id) as total_works'))
                ->groupBy('u.id')
                ->orderByDesc('total_works')
                ->limit(6)
                ->get();

            $universes = $universesRaw->map(function ($u) use ($works) {
                return [
                    'id' => $u->id,
                    'name' => $this->resolveCanonicalUniverseName($u->id, $works[0]->title ?? null),
                    'total_works' => $u->total_works,
                ];
            })->toArray();

            // Diretores e Autores frequentes no estúdio
            $creators = DB::table('catalog_work_creators as wc')
                ->join('catalog_creators as c', 'wc.creator_id', '=', 'c.id')
                ->join('catalog_roles as r', 'wc.role_id', '=', 'r.id')
                ->whereIn('wc.work_id', $workIds ?: ['00000000-0000-0000-0000-000000000000'])
                ->select('c.id', 'c.name', 'c.image_url', 'r.token as role', DB::raw('COUNT(DISTINCT wc.work_id) as total_works'))
                ->groupBy('c.id', 'c.name', 'c.image_url', 'r.token')
                ->orderByDesc('total_works')
                ->limit(6)
                ->get()
                ->toArray();

            return json_decode(json_encode([
                'studio' => $studio,
                'works' => $works,
                'formats' => $formats,
                'totalEpisodes' => $totalEpisodes,
                'universes' => $universes,
                'creators' => $creators,
            ]), true);
        });

        if (! $data) {
            return response()->json(['error' => 'entity_not_found'], 404);
        }

        $studio = (object) $data['studio'];
        $works = collect($data['works'] ?? [])->map(fn ($w) => (object) $w);
        $formats = collect($data['formats'] ?? [])->map(fn ($f) => (object) $f);
        $universes = collect($data['universes'] ?? [])->map(fn ($u) => (object) $u);
        $creators = collect($data['creators'] ?? [])->map(fn ($c) => (object) $c);

        if ($request->query('render') === 'blade' || $request->header('HX-Request') || ! $request->expectsJson()) {
            $user = $request->user();
            $pref = null;
            if ($user) {
                $pref = DB::table('user_entity_preferences')
                    ->where('user_id', $user->id)
                    ->where('target_id', $realId)
                    ->first();
            }

            return response()->view('partials.entities.studio-view', [
                'studio' => $studio,
                'works' => $works,
                'formats' => $formats,
                'totalEpisodes' => $data['totalEpisodes'] ?? 0,
                'universes' => $universes,
                'creators' => $creators,
                'isLiked' => (bool) ($pref->liked ?? false),
                'isBookmarked' => (bool) ($pref->bookmarked ?? false),
                'userScore' => $pref->user_score ?? null,
                'userStatus' => $pref->status ?? null,
            ]);
        }

        return response()->json([
            'studio' => $studio,
            'works' => $works,
        ]);
    }

    public function track(Request $request, string $id): JsonResponse|Response
    {
        $realId = $this->resolveUuid($id, 'track');

        $data = Cache::remember("catalog:track:graph:payload:v3:{$realId}", 3600, function () use ($realId) {
            $track = DB::table('catalog_tracks')->where('id', $realId)->first();
            if (! $track) {
                return null;
            }

            // Parsear metadados ricos do título da faixa (ex: '#01: "We Are!" by Hiroshi Kitadani (eps 1-47)')
            $rawTitle = $track->title ?? 'Faixa Musical';
            $songTitle = $rawTitle;
            $artistName = null;
            $episodesUsed = null;

            if (preg_match('/"([^"]+)"/', $rawTitle, $m)) {
                $songTitle = $m[1];
            }
            if (preg_match('/\bby\s+([^\(\r\n]+)/i', $rawTitle, $m)) {
                $artistName = trim($m[1]);
            }
            if (preg_match('/\((eps?[^)]+)\)/i', $rawTitle, $m)) {
                $episodesUsed = trim($m[1]);
            }

            $track->song_title = $songTitle;
            $track->artist_name = $artistName;
            $track->episodes_used = $episodesUsed;

            $composer = null;
            if ($track->composer_id) {
                $composer = DB::table('catalog_creators')->where('id', $track->composer_id)->first();
            }

            $works = DB::table('catalog_work_tracks as wt')
                ->join('catalog_works as w', 'wt.work_id', '=', 'w.id')
                ->leftJoin('catalog_work_assets as wa', 'w.id', '=', 'wa.work_id')
                ->where('wt.track_id', $realId)
                ->get(['w.id', 'w.title', 'w.format', 'w.status', 'w.episode_count', 'wa.image_url']);

            $workIds = $works->pluck('id')->all();

            // Rastrear universo da primeira obra onde toca
            $universe = null;
            if (count($works) > 0) {
                $uWork = DB::table('catalog_universe_works as uw')
                    ->where('uw.work_id', $works[0]->id)
                    ->first();
                if ($uWork) {
                    $uRow = DB::table('catalog_universes')->where('id', $uWork->universe_id)->first();
                    if ($uRow) {
                        $universe = [
                            'id' => $uRow->id,
                            'name' => $this->resolveCanonicalUniverseName($uRow->id, $works[0]->title),
                        ];
                    }
                }
            }

            // Estúdios da obra
            $studios = [];
            if (! empty($workIds)) {
                $studios = DB::table('catalog_work_studios as ws')
                    ->join('catalog_studios as s', 'ws.studio_id', '=', 's.id')
                    ->whereIn('ws.work_id', $workIds)
                    ->select('s.id', 's.name', 's.image_url')
                    ->distinct()
                    ->limit(3)
                    ->get()
                    ->toArray();
            }

            // Outras trilhas da mesma obra (OPs / EDs irmãs)
            $otherTracks = [];
            if (! empty($workIds)) {
                $otherTracks = DB::table('catalog_work_tracks as wt')
                    ->join('catalog_tracks as t', 'wt.track_id', '=', 't.id')
                    ->whereIn('wt.work_id', $workIds)
                    ->where('t.id', '!=', $realId)
                    ->select('t.id', 't.title', 't.track_type')
                    ->distinct()
                    ->limit(16)
                    ->get()
                    ->toArray();
            }

            return json_decode(json_encode([
                'track' => $track,
                'composer' => $composer,
                'works' => $works,
                'universe' => $universe,
                'studios' => $studios,
                'otherTracks' => $otherTracks,
            ]), true);
        });

        if (! $data) {
            return response()->json(['error' => 'entity_not_found'], 404);
        }

        $track = (object) $data['track'];
        $composer = ! empty($data['composer']) ? (object) $data['composer'] : null;
        $works = collect($data['works'] ?? [])->map(fn ($w) => (object) $w);
        $universe = ! empty($data['universe']) ? (object) $data['universe'] : null;
        $studios = collect($data['studios'] ?? [])->map(fn ($s) => (object) $s);
        $otherTracks = collect($data['otherTracks'] ?? [])->map(fn ($ot) => (object) $ot);

        if ($request->query('render') === 'blade' || $request->header('HX-Request') || ! $request->expectsJson()) {
            $user = $request->user();
            $pref = null;
            if ($user) {
                $pref = DB::table('user_entity_preferences')
                    ->where('user_id', $user->id)
                    ->where('target_id', $realId)
                    ->first();
            }

            return response()->view('partials.entities.track-view', [
                'track' => $track,
                'composer' => $composer,
                'works' => $works,
                'universe' => $universe,
                'studios' => $studios,
                'otherTracks' => $otherTracks,
                'isLiked' => (bool) ($pref->liked ?? false),
                'isBookmarked' => (bool) ($pref->bookmarked ?? false),
                'userScore' => $pref->user_score ?? null,
                'userStatus' => $pref->status ?? null,
            ]);
        }

        return response()->json([
            'track' => $track,
            'works' => $works,
        ]);
    }

    public function arc(Request $request, string $id, CatalogWorkGraph $graph): JsonResponse|Response
    {
        $realId = $this->resolveUuid($id, 'arc');

        $data = Cache::remember("catalog:arc:graph:payload:v5:{$realId}", 3600, function () use ($realId) {
            $arc = DB::table('catalog_arcs')->where('id', $realId)->first();
            if (! $arc) {
                return null;
            }

            $arcWork = DB::table('catalog_arc_works')->where('arc_id', $realId)->first();
            $work = null;
            $universe = null;

            if ($arcWork) {
                $arc->start_number = $arcWork->start_number ?? 1;
                $arc->end_number = $arcWork->end_number ?? null;

                $work = DB::table('catalog_works as w')
                    ->leftJoin('catalog_work_assets as wa', 'w.id', '=', 'wa.work_id')
                    ->where('w.id', $arcWork->work_id)
                    ->first(['w.id', 'w.title', 'w.media', 'w.format', 'w.status', 'w.episode_count', 'wa.image_url']);
            }

            $universeId = $arc->universe_id ?? null;
            if (! $universeId && $work) {
                $universeId = DB::table('catalog_universe_works')->where('work_id', $work->id)->value('universe_id');
            }
            if ($universeId) {
                $uRow = DB::table('catalog_universes')->where('id', $universeId)->first();
                if ($uRow) {
                    $universe = [
                        'id' => $uRow->id,
                        'name' => $this->resolveCanonicalUniverseName($uRow->id, $work->title ?? null),
                    ];
                }
            }

            $episodes = DB::table('catalog_arc_episodes as ae')
                ->join('catalog_episodes as e', 'ae.episode_id', '=', 'e.id')
                ->where('ae.arc_id', $realId)
                ->orderBy('e.number')
                ->get(['e.id', 'e.number', 'e.air_date_utc']);

            // Fallback: se catalog_arc_episodes estiver vazio mas houver range em catalog_arc_works, busca os episódios da obra nessa faixa
            if ($episodes->isEmpty() && $work && isset($arc->start_number)) {
                $epQuery = DB::table('catalog_episodes')
                    ->where('work_id', $work->id)
                    ->where('number', '>=', (int) $arc->start_number);
                if (! empty($arc->end_number)) {
                    $epQuery->where('number', '<=', (int) $arc->end_number);
                }
                $episodes = $epQuery->orderBy('number')->limit(200)->get(['id', 'number', 'air_date_utc']);
            }

            // Outros arcos da mesma obra ou universo (incluindo o próprio para linha cronológica anterior -> atual -> próximo)
            $allWorkArcs = [];
            $otherArcs = [];
            if ($work) {
                $allWorkArcs = DB::table('catalog_arc_works as aw')
                    ->join('catalog_arcs as a', 'aw.arc_id', '=', 'a.id')
                    ->where('aw.work_id', $work->id)
                    ->orderBy('aw.start_number')
                    ->orderBy('a.title')
                    ->get(['a.id', 'a.title', 'a.classification', 'aw.start_number', 'aw.end_number'])
                    ->toArray();

                $otherArcs = array_values(array_filter($allWorkArcs, fn ($a) => $a->id !== $realId));
            }

            // Criadores, Estúdios e Trilhas (OP/ED) da obra pai
            $creators = [];
            $studios = [];
            $tracks = [];
            if ($work) {
                $creators = DB::table('catalog_work_creators as wc')
                    ->join('catalog_creators as c', 'wc.creator_id', '=', 'c.id')
                    ->join('catalog_roles as r', 'wc.role_id', '=', 'r.id')
                    ->where('wc.work_id', $work->id)
                    ->limit(6)
                    ->get(['c.id', 'c.name', 'c.image_url', 'r.token as role'])
                    ->toArray();

                $studios = DB::table('catalog_work_studios as ws')
                    ->join('catalog_studios as s', 'ws.studio_id', '=', 's.id')
                    ->where('ws.work_id', $work->id)
                    ->limit(3)
                    ->get(['s.id', 's.name', 's.image_url'])
                    ->toArray();

                $tracks = DB::table('catalog_work_tracks as wt')
                    ->join('catalog_tracks as t', 'wt.track_id', '=', 't.id')
                    ->where('wt.work_id', $work->id)
                    ->limit(16)
                    ->get(['t.id', 't.title', 't.track_type'])
                    ->toArray();
            }

            return json_decode(json_encode([
                'arc' => $arc,
                'work' => $work,
                'universe' => $universe,
                'episodes' => $episodes,
                'allWorkArcs' => $allWorkArcs,
                'otherArcs' => $otherArcs,
                'creators' => $creators,
                'studios' => $studios,
                'tracks' => $tracks,
            ]), true);
        });

        if (! $data) {
            return response()->json(['error' => 'entity_not_found'], 404);
        }

        $arc = (object) $data['arc'];
        $work = ! empty($data['work']) ? (object) $data['work'] : null;
        $universe = ! empty($data['universe']) ? (object) $data['universe'] : null;
        $episodes = collect($data['episodes'] ?? [])->map(fn ($e) => (object) $e);
        $allWorkArcs = collect($data['allWorkArcs'] ?? [])->map(fn ($wa) => (object) $wa);
        $otherArcs = collect($data['otherArcs'] ?? [])->map(fn ($oa) => (object) $oa);
        $creators = collect($data['creators'] ?? [])->map(fn ($c) => (object) $c);
        $studios = collect($data['studios'] ?? [])->map(fn ($s) => (object) $s);
        $tracks = collect($data['tracks'] ?? [])->map(fn ($t) => (object) $t);

        if ($request->query('render') === 'blade' || $request->header('HX-Request') || ! $request->expectsJson()) {
            $user = $request->user();
            $pref = null;
            if ($user) {
                $pref = DB::table('user_entity_preferences')
                    ->where('user_id', $user->id)
                    ->where('target_id', $realId)
                    ->first();
            }

            return response()->view('partials.entities.arc-view', [
                'arc' => $arc,
                'work' => $work,
                'universe' => $universe,
                'episodes' => $episodes,
                'allWorkArcs' => $allWorkArcs,
                'otherArcs' => $otherArcs,
                'creators' => $creators,
                'studios' => $studios,
                'tracks' => $tracks,
                'isLiked' => (bool) ($pref->liked ?? false),
                'isBookmarked' => (bool) ($pref->bookmarked ?? false),
                'userScore' => $pref->user_score ?? null,
                'userStatus' => $pref->status ?? null,
            ]);
        }

        return response()->json([
            'arc' => $arc,
            'work' => $work,
            'universe' => $universe,
            'episodes' => $episodes,
        ]);
    }

    public function episode(Request $request, string $id, CatalogWorkGraph $graph): JsonResponse|Response
    {
        $epMeta = null;

        // Suporte a identificadores de episódios/capítulos compostos ou virtuais (<workId>:ep:<number> ou <workId>:ep-<number>)
        if (preg_match('/^(?:episode:)?(?:work:)?([0-9a-f-]{36}|[^:]+):ep[:-](\d+)$/i', trim($id), $m)) {
            $workUuid = $this->resolveUuid($m[1], 'work');
            $epNumber = max(1, (int) $m[2]);

            $epMeta = Cache::remember("catalog:episode:virtual:v3:{$workUuid}:{$epNumber}", 3600, function () use ($workUuid, $epNumber) {
                $workExists = DB::table('catalog_works')->where('id', $workUuid)->exists();
                if (! $workExists) {
                    return null;
                }

                $episode = DB::table('catalog_episodes')
                    ->where('work_id', $workUuid)
                    ->where('number', $epNumber)
                    ->first();

                if (! $episode) {
                    $episode = (object) [
                        'id' => "{$workUuid}:ep:{$epNumber}",
                        'work_id' => $workUuid,
                        'season_id' => null,
                        'number' => $epNumber,
                        'air_date_utc' => null,
                        'classification' => 'canon',
                        'is_virtual' => true,
                    ];
                }

                $currentArc = null;
                if (empty($episode->is_virtual) && ! empty($episode->id)) {
                    $arcEpisode = DB::table('catalog_arc_episodes')->where('episode_id', $episode->id)->first();
                    if ($arcEpisode) {
                        $currentArc = DB::table('catalog_arcs')->where('id', $arcEpisode->arc_id)->first();
                    }
                }

                if (! $currentArc) {
                    $currentArc = DB::table('catalog_arc_works as aw')
                        ->join('catalog_arcs as a', 'aw.arc_id', '=', 'a.id')
                        ->where('aw.work_id', $workUuid)
                        ->where(function ($q) use ($epNumber) {
                            $q->whereNull('aw.start_number')->orWhere('aw.start_number', '<=', $epNumber);
                        })
                        ->where(function ($q) use ($epNumber) {
                            $q->whereNull('aw.end_number')->orWhere('aw.end_number', '>=', $epNumber);
                        })
                        ->orderBy('aw.start_number')
                        ->select('a.*')
                        ->first();
                }

                return json_decode(json_encode([
                    'episode' => $episode,
                    'currentArc' => $currentArc,
                ]), true);
            });
        } else {
            $realId = $this->resolveUuid($id, 'episode');

            $epMeta = Cache::remember("catalog:episode:meta:v3:{$realId}", 3600, function () use ($realId) {
                $episode = DB::table('catalog_episodes')->where('id', $realId)->first();
                if (! $episode) {
                    return null;
                }

                $arcEpisode = DB::table('catalog_arc_episodes')->where('episode_id', $realId)->first();
                $currentArc = null;
                if ($arcEpisode) {
                    $currentArc = DB::table('catalog_arcs')->where('id', $arcEpisode->arc_id)->first();
                }

                if (! $currentArc && ! empty($episode->work_id)) {
                    $epNum = (int) ($episode->number ?? 1);
                    $currentArc = DB::table('catalog_arc_works as aw')
                        ->join('catalog_arcs as a', 'aw.arc_id', '=', 'a.id')
                        ->where('aw.work_id', $episode->work_id)
                        ->where(function ($q) use ($epNum) {
                            $q->whereNull('aw.start_number')->orWhere('aw.start_number', '<=', $epNum);
                        })
                        ->where(function ($q) use ($epNum) {
                            $q->whereNull('aw.end_number')->orWhere('aw.end_number', '>=', $epNum);
                        })
                        ->orderBy('aw.start_number')
                        ->select('a.*')
                        ->first();
                }

                return json_decode(json_encode([
                    'episode' => $episode,
                    'currentArc' => $currentArc,
                ]), true);
            });
        }

        if (! $epMeta) {
            return response()->json(['error' => 'entity_not_found'], 404);
        }

        $episode = (object) $epMeta['episode'];
        $currentArc = ! empty($epMeta['currentArc']) ? (object) $epMeta['currentArc'] : null;

        // Delegar para work() renderizando o contexto com o episódio ativo selecionado
        $workResponse = $this->work($request, $episode->work_id, $graph);
        if ($workResponse->getStatusCode() !== 200) {
            return $workResponse;
        }

        if ($request->query('render') === 'blade' || $request->header('HX-Request') || ! $request->expectsJson()) {
            if ($workResponse instanceof Response) {
                $viewData = $workResponse->getOriginalContent()->getData();
                $viewData['currentEpisode'] = $episode;
                if ($currentArc) {
                    $viewData['currentArc'] = $currentArc;
                }

                return response()->view('partials.entities.episode-view', $viewData);
            }
        }

        return response()->json([
            'episode' => $episode,
            'arc' => $currentArc,
            'work_id' => $episode->work_id,
        ]);
    }

    public function strings(string $locale = 'pt-BR')
    {
        $path = public_path("i18n/{$locale}.json");
        if (! file_exists($path)) {
            $path = public_path('i18n/pt-BR.json');
        }

        return response()->file($path, ['Content-Type' => 'application/json']);
    }

    public function theme(string $name = 'black')
    {
        $path = public_path("themes/{$name}.json");
        if (! file_exists($path)) {
            $path = public_path('themes/black.json');
        }

        return response()->file($path, ['Content-Type' => 'application/json']);
    }
}
