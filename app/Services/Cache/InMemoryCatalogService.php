<?php

namespace App\Services\Cache;

use App\Support\CatalogSearch;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class InMemoryCatalogService
{
    private const TTL_SECONDS = 86400;

    /**
     * Retorna os 3 lançamentos reais do horário atual para o Hero da Home (100% canônico com CatalogEpisodeFeed).
     */
    public function getHeroFeatured(): array
    {
        return Cache::remember('catalog:home:hero:3latest:canonical:v2', 900, function () {
            $calendar = $this->getCalendarByDay();
            $daysOrder = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
            $currentDayIdx = (int) date('w');
            $nowTimeStr = date('H:i');

            $roll = [];
            $todayKey = $daysOrder[$currentDayIdx];
            foreach ($calendar[$todayKey] ?? [] as $item) {
                $time = $item['time'] ?? 'TBA';
                if ($time !== 'TBA' && $time <= $nowTimeStr) {
                    $roll[] = $item;
                }
            }
            usort($roll, fn ($a, $b) => strcmp($b['time'] ?? '', $a['time'] ?? ''));

            for ($offset = 1; $offset < 7 && count($roll) < 3; $offset++) {
                $prevIdx = ($currentDayIdx - $offset + 7) % 7;
                $prevKey = $daysOrder[$prevIdx];
                $prevItems = array_values(array_filter(
                    $calendar[$prevKey] ?? [],
                    fn ($item) => ! empty($item['time']) && $item['time'] !== 'TBA'
                ));
                usort($prevItems, fn ($a, $b) => strcmp($b['time'] ?? '', $a['time'] ?? ''));
                $roll = array_merge($roll, $prevItems);
            }

            if (count($roll) >= 1) {
                $selected = array_slice($roll, 0, 3);
                $results = [];
                foreach ($selected as $it) {
                    $results[] = $this->hydrateWorkPayload(
                        (string) $it['id'],
                        (string) ($it['title'] ?? 'Obra da Temporada'),
                        (string) ($it['format'] ?? 'TV'),
                        (int) ($it['episode'] ?? 1),
                        $it['image'] ?? null,
                        [
                            'airing_time' => $it['time'] ?? null,
                            'latest_episode' => $it['episode'] ?? 1,
                        ]
                    );
                }

                return $results;
            }

            $rows = DB::table('catalog_work_schedules as s')
                ->join('catalog_works as w', 'w.id', '=', 's.work_id')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 's.work_id')
                ->whereNotNull('a.image_url')
                ->orderBy('s.latest_episode_num', 'DESC')
                ->limit(3)
                ->get(['w.id', 'w.title', 'w.format', 'w.episode_count', 'a.image_url', 's.airing_day', 's.airing_time', 's.latest_episode_num']);

            $results = [];
            foreach ($rows as $r) {
                $results[] = $this->hydrateWorkPayload(
                    $r->id, $r->title, $r->format, $r->episode_count, $r->image_url,
                    [
                        'airing_day' => $r->airing_day,
                        'airing_time' => $r->airing_time,
                        'latest_episode' => $r->latest_episode_num,
                    ]
                );
            }

            return $results;
        });
    }

    public function getCalendarByDay(): array
    {
        return Cache::remember('catalog:calendar:by_day:canonical_full', self::TTL_SECONDS, function () {
            $dayMap = [
                'monday' => 'mondays',
                'tuesday' => 'tuesdays',
                'wednesday' => 'wednesdays',
                'thursday' => 'thursdays',
                'friday' => 'fridays',
                'saturday' => 'saturdays',
                'sunday' => 'sundays',
            ];

            $calendar = [
                'mondays' => [],
                'tuesdays' => [],
                'wednesdays' => [],
                'thursdays' => [],
                'fridays' => [],
                'saturdays' => [],
                'sundays' => [],
            ];

            try {
                $catalogSearch = app(CatalogSearch::class);
                $allItems = [];
                $page = 1;
                do {
                    $feed = $catalogSearch->feed('calendar', $page, false);
                    $pageItems = $feed['items'] ?? [];
                    if (empty($pageItems)) {
                        break;
                    }
                    $allItems = array_merge($allItems, $pageItems);
                    $totalPages = $feed['pages'] ?? 1;
                    $page++;
                } while ($page <= $totalPages && $page <= 10);

                foreach ($allItems as $it) {
                    $rawDay = $it['airing_day'] ?? null;
                    if (! $rawDay) {
                        continue;
                    }

                    $cleanDay = strtolower(trim($rawDay));
                    $dayKey = $dayMap[$cleanDay] ?? null;
                    if (! $dayKey) {
                        continue;
                    }

                    $img = null;
                    if (! empty($it['images_json'])) {
                        $d = json_decode($it['images_json'], true);
                        $img = $d['jpg']['large_image_url'] ?? $d['jpg']['image_url'] ?? null;
                    }

                    $workId = $it['work_id'] ?? $it['catalog_key'] ?? $it['id'];
                    $workId = str_replace('work:', '', $workId);

                    $calendar[$dayKey][] = [
                        'id' => $workId,
                        'title' => $it['title'] ?? 'Obra da Temporada',
                        'image' => $img,
                        'format' => $it['format'] ?? 'TV',
                        'time' => $it['airing_time'] ?? 'TBA',
                        'episode' => $it['latest_episode_num'] ?? 1,
                    ];
                }

                // Ordena cada dia pelo horário de exibição
                foreach ($calendar as $key => &$dayItems) {
                    usort($dayItems, function ($a, $b) {
                        return strcmp($a['time'] ?? '99:99', $b['time'] ?? '99:99');
                    });
                }
                unset($dayItems);

                return $calendar;
            } catch (\Throwable $e) {
                // Em caso de falha no índice, usa a consulta relacional como fallback
                $daysMapping = [
                    'mondays' => 'Monday',
                    'tuesdays' => 'Tuesday',
                    'wednesdays' => 'Wednesday',
                    'thursdays' => 'Thursday',
                    'fridays' => 'Friday',
                    'saturdays' => 'Saturday',
                    'sundays' => 'Sunday',
                ];

                foreach ($daysMapping as $key => $dayName) {
                    $works = DB::table('catalog_work_schedules as s')
                        ->join('catalog_works as w', 'w.id', '=', 's.work_id')
                        ->join('catalog_work_assets as a', 'a.work_id', '=', 's.work_id')
                        ->where('s.airing_day', $dayName)
                        ->whereNotNull('a.image_url')
                        ->orderBy('s.airing_time', 'ASC')
                        ->get(['w.id', 'w.title', 'w.format', 'a.image_url', 's.airing_time', 's.latest_episode_num']);

                    $items = [];
                    foreach ($works as $w) {
                        $items[] = [
                            'id' => $w->id,
                            'title' => $this->resolveWorkTitle($w->id, $w->title),
                            'image' => $w->image_url,
                            'format' => $w->format ?? 'ANIME',
                            'time' => $w->airing_time ?? 'TBA',
                            'episode' => $w->latest_episode_num ?? 1,
                        ];
                    }
                    $calendar[$key] = $items;
                }

                return $calendar;
            }
        });
    }

    /**
     * Retorna o catálogo paginado para a visão Explorar com filtros.
     */
    public function getExploreFeed(string $media = 'all', string $format = 'all', int $page = 1, int $perPage = 600, string $status = 'all', string $sort = 'title'): array
    {
        $cacheKey = "catalog:explore:client_payload:v2:{$media}:{$perPage}";

        return Cache::remember($cacheKey, self::TTL_SECONDS, function () use ($media, $perPage) {
            $query = DB::table('catalog_works as w')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
                ->whereNotNull('a.image_url');

            if ($media !== 'all') {
                $query->where('w.media', $media);
            }

            // Filtro rigoroso: Obras no Explore inicial sao estritamente livres de conteudo adulto
            $query->where('w.is_adult', 0)
                ->whereIn('w.format', ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'])
                ->orderBy('w.id', 'ASC')
                ->limit($perPage);

            $rows = $query->get(['w.id', 'w.title', 'w.media', 'w.format', 'w.status', 'w.episode_count', 'w.is_adult', 'a.image_url']);

            $items = [];
            foreach ($rows as $r) {
                $isAdult = (bool) ($r->is_adult ?? false);

                $items[] = [
                    'id' => $r->id,
                    'title' => $this->resolveWorkTitle($r->id, $r->title),
                    'media' => $r->media,
                    'format' => $r->format ?? 'TV',
                    'status' => $r->status ?? 'RELEASING',
                    'image' => $r->image_url,
                    'episode_count' => $r->episode_count,
                    'is_adult' => $isAdult,
                ];
            }

            return [
                'total' => Cache::rememberForever('catalog:total_anime_count', function () {
                    return DB::table('catalog_works')->where('media', 'anime')->count();
                }),
                'page' => 1,
                'last_page' => 1,
                'items' => $items,
            ];
        });
    }

    public function hydrateWorkPayload(string $workId, string $title, ?string $format, ?int $episodes, ?string $imageUrl = null, array $extra = []): array
    {
        $translations = DB::table('catalog_translations')
            ->where('entity_id', $workId)
            ->get(['field', 'locale', 'value'])
            ->groupBy('field');

        $titleRomaji = $translations->get('title')?->firstWhere('locale', 'romaji')?->value
            ?? $translations->get('title')?->firstWhere('locale', 'en')?->value
            ?? $title;

        $titleNative = $translations->get('title')?->firstWhere('locale', 'ja')?->value ?? null;
        $synopsis = $translations->get('synopsis')?->firstWhere('locale', 'en')?->value ?? 'Sinopse oficial em catalogação.';

        $studio = DB::table('catalog_work_studios as ws')
            ->join('catalog_studios as s', 'ws.studio_id', '=', 's.id')
            ->where('ws.work_id', $workId)
            ->value('s.name') ?? 'Estúdio Oficial';

        $image = $imageUrl ?? DB::table('catalog_work_assets')->where('work_id', $workId)->value('image_url');

        return array_merge([
            'id' => $workId,
            'title' => $titleRomaji,
            'title_native' => $titleNative,
            'synopsis' => $synopsis,
            'format' => $format ?? 'ANIME',
            'episode_count' => $episodes ?? 0,
            'image' => $image,
            'studio' => $studio,
        ], $extra);
    }

    private function resolveWorkTitle(string $workId, string $fallback): string
    {
        return DB::table('catalog_translations')
            ->where('entity_id', $workId)
            ->where('field', 'title')
            ->whereIn('locale', ['romaji', 'en'])
            ->value('value') ?? $fallback;
    }
}
