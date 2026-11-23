<?php

namespace App\Console\Commands;

use App\Console\Concerns\LocksCatalogPipeline;
use Illuminate\Console\Command;
use Illuminate\Contracts\Console\Isolatable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PDO;
use PDOStatement;
use Throwable;

class CatalogAiringSyncCommand extends Command implements Isolatable
{
    use LocksCatalogPipeline;

    private const ANILIST_URL = 'https://graphql.anilist.co';

    private const WINDOW_QUERY = <<<'GQL'
query ($start: Int, $end: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      airingAt
      episode
      media {
        id
        idMal
        format
        status
        episodes
        title {
          romaji
          english
          native
        }
        synonyms
      }
    }
  }
}
GQL;

    private const REGIONAL_QUERY = <<<'GQL'
query ($country: CountryCode, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    media(countryOfOrigin: $country, type: ANIME, status: RELEASING) {
      id
      idMal
      format
      status
      episodes
      title {
        romaji
        english
        native
      }
      synonyms
      airingSchedule(notYetAired: false, perPage: 25) {
        nodes {
          airingAt
          episode
        }
      }
      nextAiringEpisode {
        airingAt
        episode
      }
    }
  }
}
GQL;

    private const BATCH_BY_MAL_QUERY = <<<'GQL'
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(idMal_in: $ids, type: ANIME) {
      id
      idMal
      status
      episodes
      title {
        romaji
        english
        native
      }
      synonyms
      nextAiringEpisode {
        airingAt
        episode
      }
      airingSchedule(notYetAired: false, perPage: 25) {
        nodes {
          airingAt
          episode
        }
      }
    }
  }
}
GQL;

    private const BATCH_BY_ANILIST_QUERY = <<<'GQL'
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      idMal
      status
      episodes
      title {
        romaji
        english
        native
      }
      synonyms
      nextAiringEpisode {
        airingAt
        episode
      }
      airingSchedule(notYetAired: false, perPage: 25) {
        nodes {
          airingAt
          episode
        }
      }
    }
  }
}
GQL;

    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'catalog:sync-airing';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sincroniza grade de exibição e episódios em tempo real via AniList GraphQL';

    protected $isolated = true;

    protected $isolatedExitCode = Command::FAILURE;

    public function isolationLockExpiresAt(): \DateInterval
    {
        return new \DateInterval('PT30M');
    }

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        return $this->withCatalogPipelineLock(fn (): int => $this->runSync());
    }

    private function runSync(): int
    {
        $this->info('Iniciando sincronização da grade e episódios com AniList GraphQL...');

        $now = time();
        $entries = [];
        $hadUpstreamFailure = false;

        if (! $this->collectAiringWindow($entries, $now)) {
            $hadUpstreamFailure = true;
        }

        foreach (['CN', 'KR'] as $country) {
            if (! $this->collectRegionalStreaming($entries, $country, $now)) {
                $hadUpstreamFailure = true;
            }
        }

        $this->collectRemainingTrackedAnime($entries, $now);

        if ($entries === [] && $hadUpstreamFailure) {
            $this->error('Falha ao consultar AniList GraphQL.');

            return Command::FAILURE;
        }

        $this->info(sprintf('Coletadas atualizações para %d obras na AniList.', count($entries)));

        [$malLookup, $anilistLookup] = $this->resolveWorkIdsForEntries($entries);
        $workUpdates = $this->collectMatchedWorkUpdates($entries, $malLookup, $anilistLookup);
        $matchedWorkIds = array_values(array_unique(array_column($workUpdates, 'work_id')));
        $stats = $this->persistDatabaseUpdates($workUpdates);
        $this->info(sprintf(
            'Banco atualizado: %d agendas, %d obras atualizadas, %d episódios inseridos.',
            $stats['schedules'],
            $stats['works'],
            $stats['episodes']
        ));

        $indexUpdated = $this->updatePublishedIndexes($entries, $matchedWorkIds);
        Cache::forget('catalog:home:hero:3latest:canonical:v2');
        Cache::forget('catalog:calendar:by_day:canonical_full');
        Cache::forget('catalog:home:hero:3latest:canonical:v3:safe');
        Cache::forget('catalog:home:hero:3latest:canonical:v3:adult');
        Cache::forget('catalog:calendar:by_day:canonical_full:v2:safe');
        Cache::forget('catalog:calendar:by_day:canonical_full:v2:adult');
        $this->info(sprintf('Índices publicados atualizados (%d entradas).', $indexUpdated));
        $this->info('Sincronização concluída com sucesso.');

        return Command::SUCCESS;
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     */
    private function collectAiringWindow(array &$entries, int $now): bool
    {
        $start = $now - (10 * 86400);
        $end = $now + (7 * 86400);
        $hasNext = true;
        $page = 1;
        $anySuccess = false;

        while ($hasNext && $page <= 15) {
            $data = $this->queryAnilist(self::WINDOW_QUERY, [
                'start' => $start,
                'end' => $end,
                'page' => $page,
            ]);
            if (! $data || ! isset($data['Page'])) {
                break;
            }
            $anySuccess = true;
            $items = $data['Page']['airingSchedules'] ?? [];
            foreach ($items as $item) {
                $media = $item['media'] ?? [];
                $anilistId = isset($media['id']) ? (int) $media['id'] : 0;
                $malId = isset($media['idMal']) ? (int) $media['idMal'] : 0;
                $airingAt = isset($item['airingAt']) ? (int) $item['airingAt'] : 0;
                $episode = isset($item['episode']) ? (int) $item['episode'] : 0;
                if (($anilistId <= 0 && $malId <= 0) || $airingAt <= 0 || $episode <= 0) {
                    continue;
                }

                $entryKey = $malId > 0 ? "mal:{$malId}" : "anilist:{$anilistId}";
                $isAired = $airingAt <= $now;
                $airedEp = $isAired ? $episode : max(0, $episode - 1);

                $mediaTitles = is_array($media['title'] ?? null) ? $media['title'] : [];
                $mediaSynonyms = is_array($media['synonyms'] ?? null) ? $media['synonyms'] : [];

                $this->mergeEntry($entries, $entryKey, [
                    'anilist_id' => $anilistId > 0 ? $anilistId : null,
                    'mal_id' => $malId > 0 ? $malId : null,
                    'airing_day' => gmdate('l', $airingAt),
                    'airing_time' => gmdate('H:i', $airingAt),
                    'latest_episode_num' => $airedEp,
                    'status' => $media['status'] ?? null,
                    'episode_count' => isset($media['episodes']) ? (int) $media['episodes'] : null,
                    'aired_episodes' => $isAired ? [$episode => $airingAt] : [],
                    'schedule_episodes' => [$episode => $airingAt],
                    'title_english' => $mediaTitles['english'] ?? null,
                    'title_romaji' => $mediaTitles['romaji'] ?? null,
                    'title_native' => $mediaTitles['native'] ?? null,
                    'synonyms' => $mediaSynonyms,
                ]);
            }

            $hasNext = (bool) ($data['Page']['pageInfo']['hasNextPage'] ?? false);
            $page++;
            usleep(350000);
        }

        return $anySuccess;
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     */
    private function collectRegionalStreaming(array &$entries, string $country, int $now): bool
    {
        $hasNext = true;
        $page = 1;
        $anySuccess = false;

        while ($hasNext && $page <= 3) {
            $data = $this->queryAnilist(self::REGIONAL_QUERY, [
                'country' => $country,
                'page' => $page,
            ]);
            if (! $data || ! isset($data['Page'])) {
                break;
            }
            $anySuccess = true;
            foreach ($data['Page']['media'] ?? [] as $media) {
                $this->ingestMediaNode($entries, $media, $now);
            }

            $hasNext = (bool) ($data['Page']['pageInfo']['hasNextPage'] ?? false);
            $page++;
            usleep(350000);
        }

        return $anySuccess;
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     */
    private function collectRemainingTrackedAnime(array &$entries, int $now): void
    {
        $trackedWorkIds = DB::table('catalog_works')
            ->where('media', 'anime')
            ->whereIn('status', ['RELEASING', 'NOT_YET_RELEASED'])
            ->pluck('id')
            ->all();

        if ($trackedWorkIds === []) {
            return;
        }

        $trackedIdentities = collect();
        $trackedWorkSet = array_flip($trackedWorkIds);

        foreach (['mal', 'anilist'] as $provider) {
            $lastExternalId = null;

            while (true) {
                $query = DB::table('catalog_external_identities')
                    ->where('provider', $provider)
                    ->whereRaw("namespace = 'anime:work'")
                    ->orderBy('external_id')
                    ->limit(5000);

                if ($lastExternalId !== null) {
                    $query->where('external_id', '>', $lastExternalId);
                }

                $rows = $query->get(['entity_id as work_id', 'provider', 'external_id']);
                foreach ($rows as $row) {
                    if (isset($trackedWorkSet[$row->work_id])) {
                        $trackedIdentities->push($row);
                    }
                }

                if ($rows->count() < 5000) {
                    break;
                }

                $lastExternalId = (string) $rows->last()->external_id;
                usleep(5000);
            }
        }

        if ($trackedIdentities->isEmpty()) {
            return;
        }

        $coveredWorkIds = [];
        $workToMal = [];
        $workToAnilist = [];

        foreach ($trackedIdentities as $row) {
            $num = (int) $row->external_id;
            if ($num <= 0) {
                continue;
            }
            if ($row->provider === 'mal') {
                $workToMal[$row->work_id][] = $num;
                if (isset($entries["mal:{$num}"])) {
                    $coveredWorkIds[$row->work_id] = true;
                }
            } else {
                $workToAnilist[$row->work_id][] = $num;
                if (isset($entries["anilist:{$num}"])) {
                    $coveredWorkIds[$row->work_id] = true;
                }
            }
        }

        $pendingMalIds = [];
        foreach ($workToMal as $workId => $malIds) {
            if (isset($coveredWorkIds[$workId])) {
                continue;
            }
            foreach ($malIds as $malId) {
                $pendingMalIds[$malId] = true;
            }
        }

        foreach (array_chunk(array_keys($pendingMalIds), 50) as $chunk) {
            $data = $this->queryAnilist(self::BATCH_BY_MAL_QUERY, ['ids' => $chunk]);
            if ($data && isset($data['Page']['media'])) {
                foreach ($data['Page']['media'] as $media) {
                    $this->ingestMediaNode($entries, $media, $now);
                }
            }
            usleep(350000);
        }

        foreach ($workToMal as $workId => $malIds) {
            foreach ($malIds as $malId) {
                if (isset($entries["mal:{$malId}"])) {
                    $coveredWorkIds[$workId] = true;
                }
            }
        }

        $pendingAnilistIds = [];
        foreach ($workToAnilist as $workId => $anilistIds) {
            if (isset($coveredWorkIds[$workId])) {
                continue;
            }
            foreach ($anilistIds as $anilistId) {
                if (! isset($entries["anilist:{$anilistId}"])) {
                    $pendingAnilistIds[$anilistId] = true;
                }
            }
        }

        foreach (array_chunk(array_keys($pendingAnilistIds), 50) as $chunk) {
            $data = $this->queryAnilist(self::BATCH_BY_ANILIST_QUERY, ['ids' => $chunk]);
            if ($data && isset($data['Page']['media'])) {
                foreach ($data['Page']['media'] as $media) {
                    $this->ingestMediaNode($entries, $media, $now);
                }
            }
            usleep(350000);
        }
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     * @param  array<string, mixed>  $media
     */
    private function ingestMediaNode(array &$entries, array $media, int $now): void
    {
        $anilistId = isset($media['id']) ? (int) $media['id'] : 0;
        $malId = isset($media['idMal']) ? (int) $media['idMal'] : 0;
        if ($anilistId <= 0 && $malId <= 0) {
            return;
        }

        $entryKey = $malId > 0 ? "mal:{$malId}" : "anilist:{$anilistId}";
        $status = $media['status'] ?? null;
        $episodesTotal = isset($media['episodes']) ? (int) $media['episodes'] : null;

        $airingDay = null;
        $airingTime = null;
        $latestEp = 0;
        $airedEpisodes = [];
        $scheduleEpisodes = [];

        $next = $media['nextAiringEpisode'] ?? null;
        if (is_array($next) && ! empty($next['airingAt'])) {
            $airingAt = (int) $next['airingAt'];
            $nextEp = (int) ($next['episode'] ?? 1);
            $airingDay = gmdate('l', $airingAt);
            $airingTime = gmdate('H:i', $airingAt);
            $latestEp = $airingAt <= $now ? $nextEp : max(0, $nextEp - 1);
            if ($nextEp > 0 && $airingAt > 0) {
                $scheduleEpisodes[$nextEp] = $airingAt;
            }
        }

        foreach ($media['airingSchedule']['nodes'] ?? [] as $node) {
            $nodeAt = isset($node['airingAt']) ? (int) $node['airingAt'] : 0;
            $nodeEp = isset($node['episode']) ? (int) $node['episode'] : 0;
            if ($nodeEp <= 0 || $nodeAt <= 0) {
                continue;
            }
            $scheduleEpisodes[$nodeEp] = $nodeAt;
            if ($nodeAt > $now) {
                continue;
            }
            $airedEpisodes[$nodeEp] = $nodeAt;
            if ($nodeEp > $latestEp) {
                $latestEp = $nodeEp;
            }
            if ($airingDay === null) {
                $airingDay = gmdate('l', $nodeAt);
                $airingTime = gmdate('H:i', $nodeAt);
            }
        }

        if ($status === 'FINISHED' && $episodesTotal !== null && $episodesTotal > $latestEp) {
            $latestEp = $episodesTotal;
        }

        $mediaTitles = is_array($media['title'] ?? null) ? $media['title'] : [];
        $mediaSynonyms = is_array($media['synonyms'] ?? null) ? $media['synonyms'] : [];

        $this->mergeEntry($entries, $entryKey, [
            'anilist_id' => $anilistId > 0 ? $anilistId : null,
            'mal_id' => $malId > 0 ? $malId : null,
            'airing_day' => $airingDay,
            'airing_time' => $airingTime,
            'latest_episode_num' => $latestEp,
            'status' => $status,
            'episode_count' => $episodesTotal,
            'aired_episodes' => $airedEpisodes,
            'schedule_episodes' => $scheduleEpisodes,
            'title_english' => $mediaTitles['english'] ?? null,
            'title_romaji' => $mediaTitles['romaji'] ?? null,
            'title_native' => $mediaTitles['native'] ?? null,
            'synonyms' => $mediaSynonyms,
        ]);
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     * @param  array<string, mixed>  $incoming
     */
    private function mergeEntry(array &$entries, string $entryKey, array $incoming): void
    {
        if (! isset($entries[$entryKey])) {
            $entries[$entryKey] = $incoming;

            return;
        }

        $current = &$entries[$entryKey];
        if (! empty($incoming['anilist_id']) && empty($current['anilist_id'])) {
            $current['anilist_id'] = $incoming['anilist_id'];
        }
        if (! empty($incoming['mal_id']) && empty($current['mal_id'])) {
            $current['mal_id'] = $incoming['mal_id'];
        }
        if (! empty($incoming['airing_day'])) {
            $current['airing_day'] = $incoming['airing_day'];
        }
        if (! empty($incoming['airing_time'])) {
            $current['airing_time'] = $incoming['airing_time'];
        }
        if (($incoming['latest_episode_num'] ?? 0) > ($current['latest_episode_num'] ?? 0)) {
            $current['latest_episode_num'] = $incoming['latest_episode_num'];
        }
        if (! empty($incoming['status'])) {
            $current['status'] = $incoming['status'];
        }
        if (! empty($incoming['episode_count'])) {
            $current['episode_count'] = $incoming['episode_count'];
        }
        foreach (['title_english', 'title_romaji', 'title_native'] as $titleField) {
            if (! empty($incoming[$titleField]) && empty($current[$titleField])) {
                $current[$titleField] = $incoming[$titleField];
            }
        }
        if (! empty($incoming['synonyms']) && is_array($incoming['synonyms'])) {
            $existingSynonyms = is_array($current['synonyms'] ?? null) ? $current['synonyms'] : [];
            foreach ($incoming['synonyms'] as $synonym) {
                if (is_string($synonym) && trim($synonym) !== '' && ! in_array(trim($synonym), $existingSynonyms, true)) {
                    $existingSynonyms[] = trim($synonym);
                }
            }
            $current['synonyms'] = $existingSynonyms;
        }
        foreach ($incoming['aired_episodes'] ?? [] as $epNum => $ts) {
            $current['aired_episodes'][$epNum] = $ts;
        }
        foreach ($incoming['schedule_episodes'] ?? [] as $epNum => $ts) {
            $current['schedule_episodes'][$epNum] = $ts;
        }
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     * @return array{0: array<string, list<string>>, 1: array<string, list<string>>}
     */
    private function resolveWorkIdsForEntries(array $entries): array
    {
        $malLookup = [];
        $anilistLookup = [];
        $malIds = [];
        $anilistIds = [];

        foreach ($entries as $info) {
            if (! empty($info['mal_id'])) {
                $malIds[(string) $info['mal_id']] = true;
            }
            if (! empty($info['anilist_id'])) {
                $anilistIds[(string) $info['anilist_id']] = true;
            }
        }

        $allExtIds = array_values(array_unique(array_merge(array_keys($malIds), array_keys($anilistIds))));
        $extChunks = array_chunk($allExtIds, 250);
        $lastExtChunk = count($extChunks) - 1;
        foreach ($extChunks as $chunkIndex => $chunk) {
            $rows = DB::table('catalog_external_identities')
                ->whereIn('provider', ['mal', 'anilist'])
                ->whereRaw("namespace = 'anime:work'")
                ->whereIn('external_id', $chunk)
                ->get(['provider', 'external_id', 'entity_id']);

            foreach ($rows as $row) {
                $num = (int) $row->external_id;
                if ($num <= 0) {
                    continue;
                }
                if ($row->provider === 'mal') {
                    $malLookup["mal:{$num}"][] = $row->entity_id;
                } else {
                    $anilistLookup["anilist:{$num}"][] = $row->entity_id;
                }
            }

            if ($chunkIndex < $lastExtChunk) {
                usleep(5000);
            }
        }

        $aliases = [];
        foreach (array_keys($malIds) as $id) {
            $aliases[] = "anime:{$id}";
            $aliases[] = "mal:{$id}";
        }
        foreach (array_keys($anilistIds) as $id) {
            $aliases[] = "anilist:{$id}";
        }

        $aliasChunks = array_chunk(array_values(array_unique($aliases)), 250);
        $lastAliasChunk = count($aliasChunks) - 1;
        foreach ($aliasChunks as $chunkIndex => $chunk) {
            $rows = DB::table('catalog_entity_aliases')
                ->where('kind', 'work')
                ->whereIn('alias', $chunk)
                ->get(['alias', 'entity_id']);

            foreach ($rows as $row) {
                $parts = explode(':', $row->alias);
                $num = (int) end($parts);
                if ($num <= 0) {
                    continue;
                }
                if ($parts[0] === 'anilist') {
                    $key = "anilist:{$num}";
                    if (! in_array($row->entity_id, $anilistLookup[$key] ?? [], true)) {
                        $anilistLookup[$key][] = $row->entity_id;
                    }
                } else {
                    $key = "mal:{$num}";
                    if (! in_array($row->entity_id, $malLookup[$key] ?? [], true)) {
                        $malLookup[$key][] = $row->entity_id;
                    }
                }
            }

            if ($chunkIndex < $lastAliasChunk) {
                usleep(5000);
            }
        }

        return [$malLookup, $anilistLookup];
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     * @param  array<string, list<string>>  $malLookup
     * @param  array<string, list<string>>  $anilistLookup
     * @return list<array{work_id: string, info: array<string, mixed>}>
     */
    private function collectMatchedWorkUpdates(array $entries, array $malLookup, array $anilistLookup): array
    {
        $updates = [];
        foreach ($entries as $entryKey => $info) {
            foreach ($this->matchingWorkIds($entryKey, $info, $malLookup, $anilistLookup) as $workId) {
                $updates[] = [
                    'work_id' => $workId,
                    'info' => $info,
                ];
            }
        }

        return $updates;
    }

    /**
     * @param  array<string, mixed>  $info
     * @param  array<string, list<string>>  $malLookup
     * @param  array<string, list<string>>  $anilistLookup
     * @return list<string>
     */
    private function matchingWorkIds(string $entryKey, array $info, array $malLookup, array $anilistLookup): array
    {
        $ids = [];
        if (! empty($info['mal_id'])) {
            $ids = array_merge($ids, $malLookup['mal:'.(int) $info['mal_id']] ?? []);
        }
        if ($ids === [] && ! empty($info['anilist_id'])) {
            $ids = array_merge($ids, $anilistLookup['anilist:'.(int) $info['anilist_id']] ?? []);
        }
        if ($ids === [] && str_starts_with($entryKey, 'mal:')) {
            $ids = $malLookup[$entryKey] ?? [];
        }
        if ($ids === [] && str_starts_with($entryKey, 'anilist:')) {
            $ids = $anilistLookup[$entryKey] ?? [];
        }

        return array_values(array_unique($ids));
    }

    /**
     * @param  list<array{work_id: string, info: array<string, mixed>}>  $workUpdates
     * @return array{schedules: int, works: int, episodes: int}
     */
    private function persistDatabaseUpdates(array $workUpdates): array
    {
        $stats = ['schedules' => 0, 'works' => 0, 'episodes' => 0];
        $workIdsToForget = [];
        $hasScheduleStatusCol = Schema::hasColumn('catalog_work_schedules', 'status');
        $chunks = array_chunk($workUpdates, 25);
        $lastChunkIndex = count($chunks) - 1;

        foreach ($chunks as $chunkIndex => $chunk) {
            DB::transaction(function () use ($chunk, $hasScheduleStatusCol, &$stats, &$workIdsToForget): void {
                $nowIso = now()->toISOString();
                foreach ($chunk as $item) {
                    $this->persistWorkUpdate(
                        $item['work_id'],
                        $item['info'],
                        $hasScheduleStatusCol,
                        $nowIso,
                        $stats,
                        $workIdsToForget
                    );
                }
            });

            if ($chunkIndex < $lastChunkIndex) {
                usleep(25000);
            }
        }

        foreach (array_keys($workIdsToForget) as $workId) {
            Cache::forget("catalog:work:graph:meta:v6:{$workId}");
            Cache::forget("catalog:work:graph:meta:v5:{$workId}");
        }

        return $stats;
    }

    /**
     * @param  array<string, mixed>  $info
     * @param  array{schedules: int, works: int, episodes: int}  $stats
     * @param  array<string, bool>  $workIdsToForget
     */
    private function persistWorkUpdate(
        string $workId,
        array $info,
        bool $hasScheduleStatusCol,
        string $nowIso,
        array &$stats,
        array &$workIdsToForget
    ): void {
        $work = DB::table('catalog_works')
            ->where('id', $workId)
            ->first(['id', 'media', 'status', 'episode_count']);

        if (! $work || $work->media !== 'anime') {
            return;
        }

        $latestEp = (int) ($info['latest_episode_num'] ?? 0);
        $selectCols = ['latest_episode_num', 'airing_day', 'airing_time'];
        if ($hasScheduleStatusCol) {
            $selectCols[] = 'status';
        }
        $existingSchedule = DB::table('catalog_work_schedules')
            ->where('work_id', $workId)
            ->first($selectCols);

        $nowTs = time();
        $maxAiredInDb = (int) (DB::table('catalog_episodes')
            ->where('work_id', $workId)
            ->whereNotNull('air_date_utc')
            ->where(function ($query) use ($nowTs) {
                $query->whereRaw('unixepoch(air_date_utc) <= ?', [$nowTs])
                    ->orWhereRaw('strftime("%s", air_date_utc) <= ?', [$nowTs]);
            })
            ->max('number') ?? 0);

        $resolvedLatest = max($latestEp, (int) ($existingSchedule->latest_episode_num ?? 0), $maxAiredInDb);
        $resolvedDay = $info['airing_day'] ?? ($existingSchedule->airing_day ?? null);
        $resolvedTime = $info['airing_time'] ?? ($existingSchedule->airing_time ?? null);
        $resolvedStatus = $hasScheduleStatusCol ? ($info['status'] ?? ($existingSchedule->status ?? $work->status)) : null;

        $scheduleChanged = ! $existingSchedule
            || ($existingSchedule->airing_day ?? null) !== $resolvedDay
            || ($existingSchedule->airing_time ?? null) !== $resolvedTime
            || (int) ($existingSchedule->latest_episode_num ?? 0) !== $resolvedLatest
            || ($hasScheduleStatusCol && ($existingSchedule->status ?? null) !== $resolvedStatus);

        if ($scheduleChanged) {
            $scheduleRow = [
                'work_id' => $workId,
                'airing_day' => $resolvedDay,
                'airing_time' => $resolvedTime,
                'latest_episode_num' => $resolvedLatest,
            ];
            $updateCols = ['airing_day', 'airing_time', 'latest_episode_num'];
            if ($hasScheduleStatusCol) {
                $scheduleRow['status'] = $resolvedStatus;
                $updateCols[] = 'status';
            }

            DB::table('catalog_work_schedules')->upsert([$scheduleRow], ['work_id'], $updateCols);
            $stats['schedules']++;
        }

        $workUpdates = [];
        $newStatus = $info['status'] ?? null;
        if (is_string($newStatus) && $newStatus !== '' && $newStatus !== $work->status && in_array($work->status, ['RELEASING', 'NOT_YET_RELEASED'], true)) {
            $workUpdates['status'] = $newStatus;
        }
        $newEpCount = isset($info['episode_count']) ? (int) $info['episode_count'] : 0;
        if ($newEpCount > 0 && ($work->episode_count === null || (int) $work->episode_count < $newEpCount)) {
            $workUpdates['episode_count'] = $newEpCount;
        }
        if ($workUpdates !== []) {
            DB::table('catalog_works')->where('id', $workId)->update($workUpdates);
            $stats['works']++;
            $workIdsToForget[$workId] = true;
        }

        $airedEpisodes = $info['aired_episodes'] ?? [];
        $scheduleEpisodes = $info['schedule_episodes'] ?? $airedEpisodes;
        if ($scheduleEpisodes !== []) {
            $existingRows = DB::table('catalog_episodes')
                ->where('work_id', $workId)
                ->whereIn('number', array_keys($scheduleEpisodes))
                ->get(['id', 'number', 'air_date_utc']);
            foreach ($existingRows as $epRow) {
                $epNum = (int) $epRow->number;
                $ts = $scheduleEpisodes[$epNum] ?? null;
                if (! $ts) {
                    continue;
                }
                $expectedAirDateUtc = gmdate('Y-m-d\TH:i:s.000\Z', (int) $ts);
                $existingTs = ! empty($epRow->air_date_utc) ? strtotime((string) $epRow->air_date_utc) : false;
                $isAiredEp = isset($airedEpisodes[$epNum]);
                $shouldUpdate = $epRow->air_date_utc === null
                    || ($isAiredEp && $existingTs !== false && $existingTs > (int) $ts && $epRow->air_date_utc !== $expectedAirDateUtc)
                    || (! $isAiredEp && $epRow->air_date_utc !== $expectedAirDateUtc);

                if ($shouldUpdate) {
                    DB::table('catalog_episodes')
                        ->where('id', $epRow->id)
                        ->update(['air_date_utc' => $expectedAirDateUtc]);
                    $workIdsToForget[$workId] = true;
                }
            }
        }

        if ($resolvedLatest > 0) {
            $maxExisting = (int) (DB::table('catalog_episodes')->where('work_id', $workId)->max('number') ?? 0);
            $capLatest = min($resolvedLatest, 2000);
            if ($capLatest > $maxExisting) {
                $seasonId = DB::table('catalog_seasons')
                    ->where('work_id', $workId)
                    ->orderBy('number')
                    ->value('id');

                $entityRows = [];
                $episodeRows = [];
                for ($epNum = $maxExisting + 1; $epNum <= $capLatest; $epNum++) {
                    $epId = (string) Str::uuid();
                    $airDateUtc = isset($airedEpisodes[$epNum])
                        ? gmdate('Y-m-d\TH:i:s.000\Z', (int) $airedEpisodes[$epNum])
                        : null;

                    $entityRows[] = [
                        'id' => $epId,
                        'kind' => 'episode',
                        'resolution_status' => 'verified',
                        'created_at' => $nowIso,
                        'updated_at' => $nowIso,
                    ];
                    $episodeRows[] = [
                        'id' => $epId,
                        'work_id' => $workId,
                        'season_id' => $seasonId,
                        'numbering_scheme' => 'original',
                        'number' => $epNum,
                        'air_date_utc' => $airDateUtc,
                        'classification' => 'unknown',
                    ];
                }

                foreach (array_chunk($entityRows, 200) as $chunk) {
                    DB::table('catalog_entities')->insertOrIgnore($chunk);
                }
                foreach (array_chunk($episodeRows, 200) as $chunk) {
                    DB::table('catalog_episodes')->insertOrIgnore($chunk);
                }
                $stats['episodes'] += count($episodeRows);
                $workIdsToForget[$workId] = true;
            }
        }

        $existingTitles = DB::table('catalog_entity_titles')
            ->where('entity_id', $workId)
            ->pluck('title', 'locale')
            ->all();

        $titleUpserts = [];
        foreach ([
            'en' => $info['title_english'] ?? null,
            'x-jat' => $info['title_romaji'] ?? null,
            'ja' => $info['title_native'] ?? null,
        ] as $locale => $titleVal) {
            if (! is_string($titleVal)) {
                continue;
            }
            $trimmed = trim($titleVal);
            if ($trimmed !== '' && (! array_key_exists($locale, $existingTitles) || $existingTitles[$locale] !== $trimmed)) {
                $titleUpserts[] = [
                    'entity_id' => $workId,
                    'locale' => $locale,
                    'title' => $trimmed,
                ];
            }
        }

        $synonymToInsert = null;
        if (! array_key_exists('und', $existingTitles) && ! empty($info['synonyms']) && is_array($info['synonyms'])) {
            $firstSynonym = trim((string) ($info['synonyms'][0] ?? ''));
            if ($firstSynonym !== '') {
                $synonymToInsert = [
                    'entity_id' => $workId,
                    'locale' => 'und',
                    'title' => $firstSynonym,
                ];
            }
        }

        if ($titleUpserts !== [] || $synonymToInsert !== null) {
            DB::table('catalog_entities')->insertOrIgnore([
                'id' => $workId,
                'kind' => 'work',
                'resolution_status' => 'verified',
                'created_at' => $nowIso,
                'updated_at' => $nowIso,
            ]);
            if ($titleUpserts !== []) {
                DB::table('catalog_entity_titles')->upsert($titleUpserts, ['entity_id', 'locale'], ['title']);
            }
            if ($synonymToInsert !== null) {
                DB::table('catalog_entity_titles')->insertOrIgnore($synonymToInsert);
            }
            $workIdsToForget[$workId] = true;
        }
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     * @param  list<string>  $matchedWorkIds
     */
    private function updatePublishedIndexes(array $entries, array $matchedWorkIds = []): int
    {
        $indexPath = $this->resolveActiveIndexPath();
        if ($indexPath === null || ! is_file($indexPath) || filesize($indexPath) === 0) {
            return 0;
        }

        $pdo = new PDO('sqlite:'.$indexPath, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('PRAGMA busy_timeout=5000');

        $pendingUpdates = $this->collectPendingPublishedIndexUpdates($pdo, $entries, $matchedWorkIds);

        if ($pendingUpdates === []) {
            $pdo = null;
            $this->syncManifestSearchChecksum($indexPath);

            return 0;
        }

        $updateStmt = $pdo->prepare('UPDATE works SET summary = ? WHERE work_id = ?');
        try {
            foreach (array_chunk($pendingUpdates, 50) as $chunk) {
                $pdo->beginTransaction();
                try {
                    foreach ($chunk as $params) {
                        $updateStmt->execute($params);
                    }
                    $pdo->commit();
                } catch (Throwable $e) {
                    if ($pdo->inTransaction()) {
                        $pdo->rollBack();
                    }
                    throw $e;
                }
            }
        } finally {
            $updateStmt = null;
            $pdo = null;
        }

        $this->syncManifestSearchChecksum($indexPath);

        return count($pendingUpdates);
    }

    /**
     * @param  array<string, array<string, mixed>>  $entries
     * @param  list<string>  $matchedWorkIds
     * @return list<array{0: string, 1: string}>
     */
    private function collectPendingPublishedIndexUpdates(PDO $pdo, array $entries, array $matchedWorkIds): array
    {
        $pendingUpdates = [];

        $appendUpdatedRows = function (PDOStatement $stmt) use ($entries, &$pendingUpdates): void {
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $summary = json_decode((string) $row['summary'], true);
                if (! is_array($summary)) {
                    continue;
                }
                $encoded = $this->buildUpdatedPublishedSummary($summary, $entries);
                if ($encoded !== null) {
                    $pendingUpdates[] = [$encoded, $row['work_id']];
                }
            }
        };

        if ($matchedWorkIds !== []) {
            foreach (array_chunk($matchedWorkIds, 250) as $chunk) {
                $placeholders = implode(',', array_fill(0, count($chunk), '?'));
                $stmt = $pdo->prepare("SELECT work_id, summary FROM works WHERE media = 'anime' AND work_id IN ({$placeholders})");
                $stmt->execute(array_values($chunk));
                $appendUpdatedRows($stmt);
                $stmt->closeCursor();
                $stmt = null;
            }

            return $pendingUpdates;
        }

        $stmt = $pdo->query("SELECT work_id, summary FROM works WHERE media = 'anime'");
        if ($stmt !== false) {
            $appendUpdatedRows($stmt);
            $stmt->closeCursor();
            $stmt = null;
        }

        return $pendingUpdates;
    }

    /**
     * @param  array<string, mixed>  $summary
     * @param  array<string, array<string, mixed>>  $entries
     */
    private function buildUpdatedPublishedSummary(array $summary, array $entries): ?string
    {
        $malId = (int) ($summary['mal_id'] ?? ($summary['id'] ?? 0));
        $anilistId = (int) ($summary['anilist_id'] ?? 0);
        $info = ($malId > 0 ? ($entries["mal:{$malId}"] ?? null) : null)
            ?? ($anilistId > 0 ? ($entries["anilist:{$anilistId}"] ?? null) : null);

        if (! $info) {
            return null;
        }

        $changed = false;
        if (! empty($info['airing_day']) && ($summary['airing_day'] ?? null) !== $info['airing_day']) {
            $summary['airing_day'] = $info['airing_day'];
            $changed = true;
        }
        if (! empty($info['airing_time']) && ($summary['airing_time'] ?? null) !== $info['airing_time']) {
            $summary['airing_time'] = $info['airing_time'];
            $changed = true;
        }
        if (empty($summary['airing_timezone'])) {
            $summary['airing_timezone'] = 'Asia/Tokyo';
            $changed = true;
        }
        $latestEp = (int) ($info['latest_episode_num'] ?? 0);
        if ($latestEp > 0 && (int) ($summary['latest_episode_num'] ?? 0) < $latestEp) {
            $summary['latest_episode_num'] = $latestEp;
            $changed = true;
        }
        if (! empty($info['status']) && in_array($summary['status'] ?? '', ['RELEASING', 'NOT_YET_RELEASED'], true) && $summary['status'] !== $info['status']) {
            $summary['status'] = $info['status'];
            $changed = true;
        }
        $epCount = (int) ($info['episode_count'] ?? 0);
        if ($epCount > 0 && (int) ($summary['episode_count'] ?? 0) < $epCount) {
            $summary['episode_count'] = $epCount;
            $changed = true;
        }

        return $changed
            ? json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            : null;
    }

    private function syncManifestSearchChecksum(string $indexPath): void
    {
        $manifestFile = (string) config('catalog.manifest');
        if ($manifestFile === '' || ! is_file($manifestFile) || ! is_file($indexPath)) {
            return;
        }

        $manifest = json_decode((string) file_get_contents($manifestFile), true);
        if (! is_array($manifest) || ! is_array($manifest['search'] ?? null) || ! isset($manifest['files'], $manifest['lookup'])) {
            return;
        }

        $generation = (string) ($manifest['generation'] ?? '');
        if ($generation === '' || basename($indexPath) !== $generation.'.sqlite') {
            return;
        }

        $actualSha256 = hash_file('sha256', $indexPath);
        if (! is_string($actualSha256) || $actualSha256 === ($manifest['search']['sha256'] ?? null)) {
            return;
        }

        $manifest['search']['sha256'] = $actualSha256;

        $revisionPayload = [
            'files' => $manifest['files'],
            'lookup' => $manifest['lookup'],
            'search' => $manifest['search'],
        ];
        if (isset($manifest['identities'])) {
            $revisionPayload['identities'] = $manifest['identities'];
        }
        $manifest['revision'] = hash('sha256', json_encode($revisionPayload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        $encoded = json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $tmpFile = $manifestFile.'.'.Str::uuid().'.tmp';
        file_put_contents($tmpFile, $encoded);
        rename($tmpFile, $manifestFile);
    }

    private function resolveActiveIndexPath(): ?string
    {
        $manifestFile = (string) config('catalog.manifest');
        $indexDir = (string) config('catalog.indexes');

        if ($manifestFile !== '' && is_file($manifestFile)) {
            $manifest = json_decode((string) file_get_contents($manifestFile), true);
            $generation = $manifest['generation'] ?? '';
            if (is_string($generation) && preg_match('/^[a-f0-9-]{36}$/D', $generation)) {
                $candidate = $indexDir.DIRECTORY_SEPARATOR.$generation.'.sqlite';
                if (is_file($candidate)) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $variables
     * @return array<string, mixed>|null
     */
    private function queryAnilist(string $query, array $variables): ?array
    {
        for ($attempt = 0; $attempt < 3; $attempt++) {
            try {
                $response = Http::withHeaders([
                    'User-Agent' => 'Mozilla/5.0 AniriumAiringSync/2.0',
                    'Accept' => 'application/json',
                ])
                    ->connectTimeout(5)
                    ->timeout(15)
                    ->post(self::ANILIST_URL, [
                        'query' => $query,
                        'variables' => $variables,
                    ]);

                if ($response->status() === 429) {
                    $retryAfter = max(2, min(15, (int) $response->header('Retry-After', '3')));
                    sleep($retryAfter);

                    continue;
                }

                if ($response->successful()) {
                    return $response->json('data');
                }

                if ($response->serverError()) {
                    sleep(1 + $attempt);

                    continue;
                }

                $this->warn(sprintf('AniList GraphQL HTTP %d', $response->status()));

                return null;
            } catch (ConnectionException|RequestException $e) {
                if ($attempt === 2) {
                    $this->warn('Falha ao consultar AniList: '.$e->getMessage());

                    return null;
                }
                sleep(1 + $attempt);
            }
        }

        return null;
    }
}
