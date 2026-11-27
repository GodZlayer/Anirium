<?php

namespace App\Http\Controllers;

use App\Support\CatalogRevisionRecorder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CatalogSyncController extends Controller
{
    public function version(Request $request, CatalogRevisionRecorder $recorder): JsonResponse
    {
        $allowAdult = (bool) $request->user()?->canAccessAdultContent();

        $worksCount = DB::table('catalog_works')
            ->when(! $allowAdult, fn ($q) => $q->where('is_adult', 0))
            ->count();

        $schedulesCount = DB::table('catalog_work_schedules as s')
            ->join('catalog_works as w', 'w.id', '=', 's.work_id')
            ->whereRaw("UPPER(COALESCE(w.status, '')) IN ('RELEASING', 'PUBLISHING', 'CURRENT')")
            ->when(! $allowAdult, fn ($q) => $q->where('w.is_adult', 0))
            ->count();

        $publicDbUrl = trim((string) env('CATALOG_PUBLIC_DB_URL', ''));
        if ($publicDbUrl === '') {
            $localGz = public_path('data/catalog-public.sqlite.gz');
            $ver = is_file($localGz) ? (string) filemtime($localGz) : (string) $recorder->currentRevision();
            $publicDbUrl = '/data/catalog-public.sqlite.gz?v='.$ver;
        }

        return response()->json([
            'revision' => $recorder->currentRevision(),
            'scope' => $allowAdult ? 'adult' : 'safe',
            'works_count' => $worksCount,
            'schedules_count' => $schedulesCount,
            'db_url' => $publicDbUrl,
        ])->header('Cache-Control', 'private, max-age=30');
    }

    public function snapshot(Request $request, CatalogRevisionRecorder $recorder): JsonResponse
    {
        $allowAdult = (bool) $request->user()?->canAccessAdultContent();
        $scope = $allowAdult ? 'adult' : 'safe';
        $revision = $recorder->currentRevision();

        $items = Cache::remember("catalog:snapshot:works:v1:{$scope}", 3600, function () use ($allowAdult): array {
            // Snapshot compacto: todas as obras em exibição (RELEASING/grade) + top 1500 obras com capa para evitar OOM (348k+ obras no banco)
            $releasingIds = DB::table('catalog_work_schedules as s')
                ->join('catalog_works as w', 'w.id', '=', 's.work_id')
                ->whereRaw("UPPER(COALESCE(w.status, '')) IN ('RELEASING', 'PUBLISHING', 'CURRENT')")
                ->when(! $allowAdult, fn ($q) => $q->where('w.is_adult', 0))
                ->pluck('w.id')
                ->all();

            $topIds = DB::table('catalog_works as w')
                ->join('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
                ->whereNotNull('a.image_url')
                ->where('a.image_url', '!=', '')
                ->when(! $allowAdult, fn ($q) => $q->where('w.is_adult', 0))
                ->orderBy('w.title')
                ->limit(1500)
                ->pluck('w.id')
                ->all();

            $ids = array_values(array_unique(array_merge($releasingIds, $topIds)));

            return $ids !== [] ? $this->hydrateWorkRecords($ids, $allowAdult) : [];
        });

        return response()->json([
            'revision' => $revision,
            'scope' => $scope,
            'count' => count($items),
            'items' => $items,
        ])->header('Cache-Control', 'private, max-age=60');
    }

    public function explore(Request $request): JsonResponse
    {
        $kind = strtolower(trim((string) $request->query('kind', 'work')));
        $q = trim((string) $request->query('q', ''));
        $page = max(1, (int) $request->query('page', 1));
        $perPage = 24;
        $offset = ($page - 1) * $perPage;
        $allowAdult = (bool) $request->user()?->canAccessAdultContent() && $request->boolean('adult');

        $mediaFilter = $kind === 'manga' ? ['manga', 'novel'] : ['anime'];

        $query = DB::table('catalog_works as w')
            ->join('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
            ->whereIn('w.media', $mediaFilter)
            ->whereNotNull('a.image_url')
            ->where('a.image_url', '!=', '')
            ->when(! $allowAdult, fn ($builder) => $builder->where('w.is_adult', 0));

        if ($q !== '') {
            $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $q).'%';
            $titleMatchIds = DB::table('catalog_entity_titles')
                ->where('title', 'like', $like)
                ->limit(200)
                ->pluck('entity_id')
                ->all();

            $query->where(function ($builder) use ($like, $titleMatchIds): void {
                $builder->where('w.title', 'like', $like);
                if ($titleMatchIds !== []) {
                    $builder->orWhereIn('w.id', $titleMatchIds);
                }
            });
        }

        // Busca perPage + 1 para saber se existe próxima página sem rodar COUNT(*) em 348k linhas
        $rows = $query
            ->orderBy('w.title')
            ->offset($offset)
            ->limit($perPage + 1)
            ->get([
                'w.id',
                'w.media',
                'w.title',
                'w.format',
                'w.status',
                'w.episode_count',
                'w.is_adult',
                'a.image_url',
            ]);

        $hasMore = $rows->count() > $perPage;
        $slice = $rows->take($perPage);

        $items = [];
        foreach ($slice as $row) {
            $items[] = [
                'id' => (string) $row->id,
                'media' => (string) $row->media,
                'title' => (string) $row->title,
                'format' => strtoupper((string) ($row->format ?: ($kind === 'manga' ? 'MANGA' : 'TV'))),
                'status' => strtoupper((string) ($row->status ?: 'COMPLETED')),
                'episode_count' => $row->episode_count !== null ? (int) $row->episode_count : null,
                'is_adult' => (bool) $row->is_adult,
                'image' => (string) $row->image_url,
            ];
        }

        return response()->json([
            'items' => $items,
            'page' => $page,
            'pages' => $hasMore ? $page + 1 : $page,
            'total' => $hasMore ? ($offset + $perPage + 1) : ($offset + count($items)),
            'has_more' => $hasMore,
        ])->header('Cache-Control', 'private, max-age=30');
    }

    public function delta(Request $request, CatalogRevisionRecorder $recorder): JsonResponse
    {
        $since = max(0, (int) $request->query('since', 0));
        $allowAdult = (bool) $request->user()?->canAccessAdultContent();
        $currentRevision = $recorder->currentRevision();

        if ($since >= $currentRevision || ! Schema::hasTable('catalog_sync_revisions')) {
            return response()->json([
                'revision' => $currentRevision,
                'since' => $since,
                'upserts' => [],
                'deletes' => [],
            ]);
        }

        $changes = DB::table('catalog_sync_revisions')
            ->where('entity_type', 'work')
            ->where('id', '>', $since)
            ->orderBy('id')
            ->get(['entity_id', 'action']);

        $upsertIds = [];
        $deleteIds = [];
        foreach ($changes as $change) {
            $id = (string) $change->entity_id;
            if ($change->action === 'delete') {
                unset($upsertIds[$id]);
                $deleteIds[$id] = true;
            } else {
                unset($deleteIds[$id]);
                $upsertIds[$id] = true;
            }
        }

        $upserts = $upsertIds !== []
            ? $this->hydrateWorkRecords(array_keys($upsertIds), $allowAdult)
            : [];

        return response()->json([
            'revision' => $currentRevision,
            'since' => $since,
            'upserts' => $upserts,
            'deletes' => array_keys($deleteIds),
        ]);
    }

    /**
     * @param  array<int, string>|null  $onlyIds
     * @return array<int, array<string, mixed>>
     */
    private function hydrateWorkRecords(?array $onlyIds, bool $allowAdult): array
    {
        $query = DB::table('catalog_works as w')
            ->leftJoin('catalog_work_schedules as s', 's.work_id', '=', 'w.id')
            ->leftJoin('catalog_work_assets as a', 'a.work_id', '=', 'w.id')
            ->when(! $allowAdult, fn ($q) => $q->where('w.is_adult', 0))
            ->when($onlyIds !== null, fn ($q) => $q->whereIn('w.id', $onlyIds))
            ->select(
                'w.id',
                'w.media',
                'w.title',
                'w.format',
                'w.status',
                'w.episode_count',
                'w.is_adult',
                'a.image_url',
                's.airing_day',
                's.airing_time',
                's.latest_episode_num'
            );

        $rows = $query->get();
        if ($rows->isEmpty()) {
            return [];
        }

        $workIds = $rows->pluck('id')->all();
        $titlesMap = $this->loadMultiTitlesMap($workIds);

        $items = [];
        foreach ($rows as $row) {
            $id = (string) $row->id;
            $allTitles = $titlesMap[$id] ?? [];
            $primaryTitle = (string) ($row->title ?? '');
            if ($primaryTitle !== '' && ! in_array($primaryTitle, $allTitles, true)) {
                array_unshift($allTitles, $primaryTitle);
            }

            $items[] = [
                'id' => $id,
                'media' => (string) ($row->media ?? 'anime'),
                'title' => $primaryTitle,
                'titles' => $allTitles,
                'format' => strtoupper((string) ($row->format ?? '')),
                'status' => strtoupper((string) ($row->status ?? '')),
                'episode_count' => $row->episode_count !== null ? (int) $row->episode_count : null,
                'is_adult' => (bool) ($row->is_adult ?? false),
                'image' => $row->image_url ?: null,
                'airing_day' => $row->airing_day ? strtolower(trim((string) $row->airing_day)) : null,
                'airing_time' => $row->airing_time ?: null,
                'latest_episode_num' => $row->latest_episode_num !== null ? (int) $row->latest_episode_num : null,
                'schedule_status' => strtoupper((string) ($row->status ?? '')) ?: null,
            ];
        }

        return $items;
    }

    /**
     * @param  array<int, string>  $workIds
     * @return array<string, array<int, string>>
     */
    private function loadMultiTitlesMap(array $workIds): array
    {
        $map = [];

        if (Schema::hasTable('catalog_entity_titles')) {
            foreach (array_chunk($workIds, 500) as $chunk) {
                $rows = DB::table('catalog_entity_titles')
                    ->whereIn('entity_id', $chunk)
                    ->get(['entity_id', 'title']);
                foreach ($rows as $r) {
                    $t = trim((string) ($r->title ?? ''));
                    if ($t !== '') {
                        $map[(string) $r->entity_id][$t] = true;
                    }
                }
            }
        }

        if (Schema::hasTable('catalog_entity_aliases')) {
            foreach (array_chunk($workIds, 500) as $chunk) {
                $rows = DB::table('catalog_entity_aliases')
                    ->whereIn('entity_id', $chunk)
                    ->get(['entity_id', 'alias']);
                foreach ($rows as $r) {
                    $a = trim((string) ($r->alias ?? ''));
                    if ($a !== '') {
                        $map[(string) $r->entity_id][$a] = true;
                    }
                }
            }
        }

        $result = [];
        foreach ($map as $entityId => $set) {
            $result[$entityId] = array_keys($set);
        }

        return $result;
    }
}
