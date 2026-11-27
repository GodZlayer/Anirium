<?php

namespace App\Console\Commands;

use App\Support\CatalogRevisionRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class CatalogEnrichLiteratureCommand extends Command
{
    protected $signature = 'catalog:enrich-literature
        {--limit=200 : Max AniList batch items to enrich per run}
        {--only-oneshots : Only run deterministic ONE_SHOT chapter backfill}';

    protected $description = 'Enriquece capítulos, volumes e agenda semanal de literatura (Mangá/Novel) via ONE_SHOT + AniList GraphQL';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $onlyOneshots = (bool) $this->option('only-oneshots');

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
            app(CatalogRevisionRecorder::class)->recordBatch('catalog:enrich-literature', $staleLitWorkIds, 'upsert', 'work');
        }
        $this->info('Agendas sintéticas/obsoletas de literatura removidas: '.count($staleLitWorkIds));

        if ($onlyOneshots) {
            return self::SUCCESS;
        }

        // 3. Enriquecimento em lote via AniList GraphQL (50 por request via idMal_in)
        $candidates = DB::table('catalog_works as w')
            ->join('catalog_external_identities as ext', function ($join) {
                $join->on('ext.entity_id', '=', 'w.id')->where('ext.provider', '=', 'mal');
            })
            ->whereIn('w.media', ['manga', 'novel'])
            ->where(function ($q) {
                $q->whereNull('w.episode_count')->orWhere('w.episode_count', '<=', 0);
            })
            ->select('w.id', 'ext.external_id as mal_id')
            ->limit($limit)
            ->get();

        $enriched = 0;
        foreach ($candidates->chunk(50) as $chunk) {
            $malMap = [];
            foreach ($chunk as $row) {
                $malId = (int) $row->mal_id;
                if ($malId > 0) {
                    $malMap[$malId] = $row->id;
                }
            }
            if (empty($malMap)) {
                continue;
            }

            $response = Http::timeout(12)->post('https://graphql.anilist.co', [
                'query' => 'query ($ids: [Int]) { Page(perPage: 50) { media(idMal_in: $ids, type: MANGA) { idMal chapters volumes status } } }',
                'variables' => ['ids' => array_keys($malMap)],
            ]);

            if (! $response->ok()) {
                $this->warn('AniList rate limit / erro HTTP '.$response->status().' — encerrando lote com segurança.');
                break;
            }

            $mediaList = $response->json('data.Page.media') ?? [];
            foreach ($mediaList as $item) {
                $malId = (int) ($item['idMal'] ?? 0);
                $workId = $malMap[$malId] ?? null;
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
                    $enriched++;
                }
            }
            usleep(600000);
        }

        $this->info("Obras de literatura enriquecidas via AniList: {$enriched}");

        if ($updatedOneshots > 0 || $scheduledCount > 0 || $enriched > 0) {
            Cache::forget('catalog:calendar:by_day:canonical_full:v2:safe');
            Cache::forget('catalog:calendar:by_day:canonical_full:v2:adult');
        }

        return self::SUCCESS;
    }
}
