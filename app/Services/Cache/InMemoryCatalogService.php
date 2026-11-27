<?php

namespace App\Services\Cache;

use App\Support\LocaleResolver;
use App\Support\SynopsisTranslator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class InMemoryCatalogService
{
    private const TTL_SECONDS = 86400;

    /**
     * Retorna os 3 lançamentos reais do horário atual para o Hero da Home (100% canônico com CatalogEpisodeFeed).
     */
    public function getHeroFeatured(bool $allowAdult = false, string $uiLocale = 'en-US'): array
    {
        $scope = $allowAdult ? 'adult' : 'safe';
        $normalizedLocale = app(LocaleResolver::class)->normalize($uiLocale) ?? 'en-US';

        return Cache::remember("catalog:home:hero:3latest:canonical:v4:{$scope}:{$normalizedLocale}", 900, function () use ($allowAdult, $normalizedLocale) {
            $calendar = $this->getCalendarByDay($allowAdult);
            $daysOrder = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
            $currentDayIdx = (int) date('w');
            $nowTimeStr = date('H:i');

            $roll = [];
            $todayKey = $daysOrder[$currentDayIdx];
            foreach ($calendar[$todayKey] ?? [] as $item) {
                if (($item['media'] ?? 'anime') !== 'anime') {
                    continue;
                }
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
                    fn ($item) => ($item['media'] ?? 'anime') === 'anime' && ! empty($item['time']) && $item['time'] !== 'TBA'
                ));
                usort($prevItems, fn ($a, $b) => strcmp($b['time'] ?? '', $a['time'] ?? ''));
                $roll = array_merge($roll, $prevItems);
            }

            if (count($roll) >= 1) {
                $nowTs = time();
                $results = [];
                foreach ($roll as $it) {
                    if (count($results) >= 3) {
                        break;
                    }
                    $workId = (string) $it['id'];
                    $episodeNum = (int) ($it['episode'] ?? 1);
                    $scheduleLatestEp = (int) (DB::table('catalog_work_schedules')->where('work_id', $workId)->value('latest_episode_num') ?? 0);
                    $epAirDate = DB::table('catalog_episodes')
                        ->where('work_id', $workId)
                        ->where('number', $episodeNum)
                        ->value('air_date_utc');
                    if (! empty($epAirDate) && strtotime((string) $epAirDate) > $nowTs && ($scheduleLatestEp <= 0 || $episodeNum > $scheduleLatestEp)) {
                        $latestAired = DB::table('catalog_episodes')
                            ->where('work_id', $workId)
                            ->where(function ($query) use ($nowTs) {
                                $query->whereNull('air_date_utc')
                                    ->orWhereRaw('unixepoch(air_date_utc) <= ?', [$nowTs]);
                            })
                            ->max('number');
                        if (! $latestAired || (int) $latestAired < 1) {
                            continue;
                        }
                        $episodeNum = (int) $latestAired;
                    }
                    $results[] = $this->hydrateWorkPayload(
                        $workId,
                        (string) ($it['title'] ?? 'Obra da Temporada'),
                        (string) ($it['format'] ?? 'TV'),
                        $episodeNum,
                        $it['image'] ?? null,
                        [
                            'airing_time' => $it['time'] ?? null,
                            'latest_episode' => $episodeNum,
                            'is_adult' => (bool) ($it['is_adult'] ?? false),
                        ],
                        $normalizedLocale
                    );
                }

                if (count($results) >= 1) {
                    return $results;
                }
            }

            $rowsQuery = DB::table('catalog_work_schedules as s')
                ->join('catalog_works as w', 'w.id', '=', 's.work_id')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 's.work_id')
                ->where('w.media', 'anime')
                ->whereNotNull('a.image_url');

            if (! $allowAdult) {
                $rowsQuery->where('w.is_adult', 0);
            }

            $rows = $rowsQuery
                ->orderBy('s.latest_episode_num', 'DESC')
                ->limit(3)
                ->get(['w.id', 'w.title', 'w.format', 'w.episode_count', 'w.is_adult', 'a.image_url', 's.airing_day', 's.airing_time', 's.latest_episode_num']);

            $results = [];
            foreach ($rows as $r) {
                $results[] = $this->hydrateWorkPayload(
                    $r->id, $r->title, $r->format, $r->episode_count, $r->image_url,
                    [
                        'airing_day' => $r->airing_day,
                        'airing_time' => $r->airing_time,
                        'latest_episode' => $r->latest_episode_num,
                        'is_adult' => (bool) ($r->is_adult ?? false),
                    ],
                    $normalizedLocale
                );
            }

            return $results;
        });
    }

    public function getCalendarByDay(bool $allowAdult = false): array
    {
        $scope = $allowAdult ? 'adult' : 'safe';

        return Cache::remember("catalog:calendar:by_day:ssot:v3:{$scope}", self::TTL_SECONDS, function () use ($allowAdult) {
            $dayMap = [
                'monday' => 'mondays',
                'mondays' => 'mondays',
                'tuesday' => 'tuesdays',
                'tuesdays' => 'tuesdays',
                'wednesday' => 'wednesdays',
                'wednesdays' => 'wednesdays',
                'thursday' => 'thursdays',
                'thursdays' => 'thursdays',
                'friday' => 'fridays',
                'fridays' => 'fridays',
                'saturday' => 'saturdays',
                'saturdays' => 'saturdays',
                'sunday' => 'sundays',
                'sundays' => 'sundays',
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

            // Fonte Única de Verdade (SSOT): consulta direta às tabelas relacionais
            $rows = DB::table('catalog_work_schedules as s')
                ->join('catalog_works as w', 'w.id', '=', 's.work_id')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
                ->whereNotNull('s.airing_day')
                ->where('s.airing_day', '!=', '')
                ->whereNotNull('a.image_url')
                ->where('a.image_url', '!=', '')
                ->whereRaw("UPPER(COALESCE(w.status, '')) IN ('RELEASING', 'PUBLISHING', 'CURRENT')")
                ->where(function ($q) {
                    // Ignora agendas sintéticas antigas de literatura (horário 00:00)
                    $q->where('w.media', 'anime')
                        ->orWhere(function ($lit) {
                            $lit->whereIn('w.media', ['manga', 'novel'])
                                ->whereNotNull('s.airing_time')
                                ->where('s.airing_time', '!=', '00:00');
                        });
                })
                ->when(! $allowAdult, fn ($q) => $q->where('w.is_adult', 0))
                ->select(
                    'w.id',
                    'w.title',
                    'w.format',
                    'w.media',
                    'w.is_adult',
                    's.airing_day',
                    's.airing_time',
                    's.latest_episode_num',
                    'a.image_url'
                )
                ->get();

            foreach ($rows as $row) {
                $cleanDay = strtolower(trim((string) ($row->airing_day ?? '')));
                $dayKey = $dayMap[$cleanDay] ?? null;
                if (! $dayKey) {
                    continue;
                }

                $isAnime = strtolower((string) ($row->media ?? 'anime')) === 'anime';
                $calendar[$dayKey][] = [
                    'id' => (string) $row->id,
                    'title' => (string) ($row->title ?? 'Obra da Temporada'),
                    'image' => $row->image_url ?: null,
                    'format' => strtoupper((string) ($row->format ?: ($isAnime ? 'TV' : 'MANGA'))),
                    'media' => $isAnime ? 'anime' : 'literature',
                    'unit_label' => $isAnime ? 'Ep.' : 'Cap.',
                    'time' => $row->airing_time ?: 'TBA',
                    'episode' => max(1, (int) ($row->latest_episode_num ?? 1)),
                    'is_adult' => (bool) ($row->is_adult ?? false),
                ];
            }

            foreach ($calendar as $key => &$dayItems) {
                usort($dayItems, function ($a, $b) {
                    return strcmp($a['time'] ?? '99:99', $b['time'] ?? '99:99');
                });
            }
            unset($dayItems);

            return $calendar;
        });
    }

    /**
     * Retorna o catálogo paginado para a visão Explorar com filtros.
     */
    public function getExploreFeed(string $media = 'all', string $format = 'all', int $page = 1, int $perPage = 600, string $status = 'all', string $sort = 'title', bool $allowAdult = false): array
    {
        $scope = $allowAdult ? 'adult' : 'safe';
        $cacheKey = "catalog:explore:client_payload:v3:{$media}:{$perPage}:{$scope}";

        return Cache::remember($cacheKey, self::TTL_SECONDS, function () use ($media, $perPage, $allowAdult) {
            $query = DB::table('catalog_works as w')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
                ->whereNotNull('a.image_url');

            if ($media !== 'all') {
                $query->where('w.media', $media);
            }

            if (! $allowAdult) {
                $query->where('w.is_adult', 0);
            }

            $allowedFormats = $allowAdult
                ? ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'HENTAI']
                : ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'];

            $query->whereIn('w.format', $allowedFormats)
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

    public function hydrateWorkPayload(string $workId, string $title, ?string $format, ?int $episodes, ?string $imageUrl = null, array $extra = [], string $uiLocale = 'en-US'): array
    {
        $translations = DB::table('catalog_translations')
            ->where('entity_id', $workId)
            ->get(['field', 'locale', 'value'])
            ->groupBy('field');

        $titleRomaji = $translations->get('title')?->firstWhere('locale', 'romaji')?->value
            ?? $translations->get('title')?->firstWhere('locale', 'en')?->value
            ?? $title;

        $titleNative = $translations->get('title')?->firstWhere('locale', 'ja')?->value ?? null;
        $synopsis = app(SynopsisTranslator::class)->resolveForWork($workId, $uiLocale) ?? 'Sinopse oficial em catalogação.';

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
