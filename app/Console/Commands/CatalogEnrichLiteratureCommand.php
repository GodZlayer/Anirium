<?php

namespace App\Console\Commands;

use App\Support\CatalogRevisionRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class CatalogEnrichLiteratureCommand extends Command
{
    protected $signature = 'catalog:enrich-literature
                            {--limit=500 : Máximo de obras processadas nesta execução (0 = ilimitado)}
                            {--only-oneshots : Executa apenas preenchimento determinístico de ONE_SHOT (sem API externa)}
                            {--reset-checkpoint : Reinicia o cursor de checkpoint}';

    protected $description = 'Enriquece obras literárias (capítulos, volumes e capas) via AniList GraphQL com checkpoint e retomada';

    private const ANILIST_URL = 'https://graphql.anilist.co';

    private const BY_ANILIST_QUERY = 'query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: MANGA) { id idMal chapters volumes status coverImage { large } } } }';

    private const BY_MAL_QUERY = 'query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: MANGA) { id idMal chapters volumes status coverImage { large } } } }';

    public function handle(CatalogRevisionRecorder $recorder): int
    {
        $limit = max(0, (int) $this->option('limit'));
        $onlyOneshots = (bool) $this->option('only-oneshots');
        $checkpointPath = storage_path('app/literature_enrich_checkpoint.json');

        if ($this->option('reset-checkpoint') && is_file($checkpointPath)) {
            @unlink($checkpointPath);
        }

        // 1. Regra determinística instantânea: ONE_SHOT sem contagem => 1 capítulo
        $updatedOneshots = DB::table('catalog_works')
            ->whereIn('media', ['manga', 'novel'])
            ->whereRaw("UPPER(COALESCE(format, '')) = 'ONE_SHOT'")
            ->where(function ($q) {
                $q->whereNull('episode_count')->orWhere('episode_count', '<=', 0);
            })
            ->update(['episode_count' => 1]);

        $this->info("ONE_SHOT atualizados deterministicamente (episode_count=1): {$updatedOneshots}");

        // 2. Remover agendas sintéticas/obsoletas de literatura (obras finalizadas ou com horário sintético 00:00)
        $staleLitWorkIds = DB::table('catalog_work_schedules as s')
            ->join('catalog_works as w', 'w.id', '=', 's.work_id')
            ->whereIn('w.media', ['manga', 'novel'])
            ->where(function ($q) {
                $q->whereRaw("UPPER(COALESCE(w.status, '')) NOT IN ('RELEASING','PUBLISHING','CURRENT')")
                    ->orWhere('s.airing_time', '=', '00:00');
            })
            ->pluck('s.work_id')
            ->all();

        if ($staleLitWorkIds !== []) {
            DB::table('catalog_work_schedules')->whereIn('work_id', $staleLitWorkIds)->delete();
            $recorder->recordBatch('catalog:enrich-literature', $staleLitWorkIds, 'upsert', 'work');
        }
        $this->info('Agendas sintéticas/obsoletas de literatura removidas: '.count($staleLitWorkIds));

        if ($onlyOneshots) {
            return self::SUCCESS;
        }

        $checkpoint = is_file($checkpointPath)
            ? (json_decode((string) file_get_contents($checkpointPath), true) ?: [])
            : [];
        $lastWorkId = (string) ($checkpoint['last_work_id'] ?? '');

        $processed = 0;
        $enrichedChapters = 0;
        $enrichedCovers = 0;
        $updatedWorkIds = [];

        while ($limit === 0 || $processed < $limit) {
            $batchSize = $limit > 0 ? min(50, $limit - $processed) : 50;

            $rows = DB::table('catalog_works as w')
                ->join('catalog_external_identities as ext', function ($join) {
                    $join->on('ext.entity_id', '=', 'w.id')
                        ->whereIn('ext.provider', ['anilist', 'mal']);
                })
                ->whereIn('w.media', ['manga', 'novel'])
                ->whereRaw("UPPER(COALESCE(w.format, '')) NOT IN ('DOUJINSHI', 'OTHER')")
                ->where(function ($q) {
                    $q->whereNull('w.episode_count')->orWhere('w.episode_count', '<=', 0);
                })
                ->when($lastWorkId !== '', fn ($q) => $q->where('w.id', '>', $lastWorkId))
                ->orderBy('w.id', 'ASC')
                ->select('w.id', 'ext.provider', 'ext.external_id')
                ->limit($batchSize * 2)
                ->get();

            if ($rows->isEmpty()) {
                $this->info('Fim da fila de obras literárias oficiais pendentes!');
                break;
            }

            // Agrupa por work_id priorizando anilist_id sobre mal_id
            $byWork = [];
            foreach ($rows as $row) {
                $wid = (string) $row->id;
                $extId = is_numeric($row->external_id) ? (int) $row->external_id : 0;
                if ($extId <= 0) {
                    continue;
                }
                if (! isset($byWork[$wid])) {
                    $byWork[$wid] = ['anilist' => null, 'mal' => null];
                }
                if ($row->provider === 'anilist') {
                    $byWork[$wid]['anilist'] = $extId;
                } elseif ($row->provider === 'mal') {
                    $byWork[$wid]['mal'] = $extId;
                }
                if (count($byWork) >= $batchSize) {
                    break;
                }
            }

            if ($byWork === []) {
                break;
            }

            $alMap = [];
            $malMap = [];
            foreach ($byWork as $wid => $ids) {
                $lastWorkId = $wid;
                if ($ids['anilist']) {
                    $alMap[$ids['anilist']] = $wid;
                } elseif ($ids['mal']) {
                    $malMap[$ids['mal']] = $wid;
                }
            }

            $processed += count($byWork);

            if ($alMap !== []) {
                $mediaList = $this->queryAnilistWithRetry(self::BY_ANILIST_QUERY, array_keys($alMap));
                if ($mediaList === null) {
                    $this->warn('Falha persistente na AniList — salvando checkpoint e encerrando com segurança.');
                    break;
                }
                [$cUp, $imgUp, $wIds] = $this->applyAnilistBatch($mediaList, $alMap, 'id');
                $enrichedChapters += $cUp;
                $enrichedCovers += $imgUp;
                $updatedWorkIds = array_merge($updatedWorkIds, $wIds);
            }

            if ($malMap !== []) {
                $mediaList = $this->queryAnilistWithRetry(self::BY_MAL_QUERY, array_keys($malMap));
                if ($mediaList !== null) {
                    [$cUp, $imgUp, $wIds] = $this->applyAnilistBatch($mediaList, $malMap, 'idMal');
                    $enrichedChapters += $cUp;
                    $enrichedCovers += $imgUp;
                    $updatedWorkIds = array_merge($updatedWorkIds, $wIds);
                }
            }

            file_put_contents($checkpointPath, json_encode([
                'last_work_id' => $lastWorkId,
                'updated_at' => gmdate('c'),
                'last_run_processed' => $processed,
                'last_run_enriched_chapters' => $enrichedChapters,
                'last_run_enriched_covers' => $enrichedCovers,
            ], JSON_PRETTY_PRINT));

            if ($processed % 250 === 0 || ($limit > 0 && $processed >= $limit)) {
                $this->info("Progresso: {$processed} processadas | +{$enrichedChapters} capítulos | +{$enrichedCovers} capas");
            }

            // Respeita rate limit da AniList (~30 req/min)
            usleep(2_100_000);
        }

        if ($updatedWorkIds !== []) {
            $recorder->recordBatch('catalog:enrich-literature', $updatedWorkIds, 'upsert', 'work');
        }

        $this->info("Concluído: {$processed} processadas | {$enrichedChapters} capítulos preenchidos | {$enrichedCovers} capas preenchidas.");

        return self::SUCCESS;
    }

    /**
     * @param  array<int, int>  $ids
     * @return array<int, array<string, mixed>>|null
     */
    private function queryAnilistWithRetry(string $query, array $ids): ?array
    {
        for ($attempt = 1; $attempt <= 4; $attempt++) {
            try {
                $response = Http::withoutVerifying()
                    ->timeout(20)
                    ->post(self::ANILIST_URL, [
                        'query' => $query,
                        'variables' => ['ids' => array_values($ids)],
                    ]);

                if ($response->status() === 429) {
                    $retryAfter = max(5, min(65, (int) ($response->header('Retry-After') ?: 20)));
                    $this->warn("AniList 429 — aguardando {$retryAfter}s (tentativa {$attempt}/4)...");
                    sleep($retryAfter);

                    continue;
                }

                if ($response->successful()) {
                    return $response->json('data.Page.media') ?? [];
                }
            } catch (\Throwable $e) {
                $this->warn("Erro de rede AniList (tentativa {$attempt}/4): {$e->getMessage()}");
            }

            sleep(3 * $attempt);
        }

        return null;
    }

    /**
     * @param  array<int, array<string, mixed>>  $mediaList
     * @param  array<int, string>  $idMap
     * @return array{0: int, 1: int, 2: array<int, string>}
     */
    private function applyAnilistBatch(array $mediaList, array $idMap, string $keyField): array
    {
        $enrichedChapters = 0;
        $enrichedCovers = 0;
        $updatedIds = [];

        foreach ($mediaList as $item) {
            $extId = (int) ($item[$keyField] ?? 0);
            $workId = $idMap[$extId] ?? null;
            if (! $workId) {
                continue;
            }

            $chapters = (int) ($item['chapters'] ?? 0);
            $volumes = (int) ($item['volumes'] ?? 0);
            $count = $chapters > 0 ? $chapters : $volumes;

            if ($count > 0) {
                DB::table('catalog_works')->where('id', $workId)->update([
                    'episode_count' => $count,
                ]);
                $enrichedChapters++;
                $updatedIds[] = $workId;
            }

            $coverUrl = trim((string) ($item['coverImage']['large'] ?? ''));
            if ($coverUrl !== '') {
                $existingImg = DB::table('catalog_work_assets')->where('work_id', $workId)->value('image_url');
                if (! $existingImg) {
                    DB::table('catalog_work_assets')->updateOrInsert(
                        ['work_id' => $workId],
                        ['image_url' => $coverUrl]
                    );
                    $enrichedCovers++;
                    $updatedIds[] = $workId;
                }
            }
        }

        return [$enrichedChapters, $enrichedCovers, array_values(array_unique($updatedIds))];
    }
}
