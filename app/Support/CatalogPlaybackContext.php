<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogPlaybackContext
{
    public function __construct(private CatalogGraphVisibility $visibility) {}

    public function read(string $workId, ?string $episodeId, bool $adult): ?array
    {
        $work = DB::table('catalog_works')->where(['id' => $workId, 'media' => 'anime'])->first();
        if (! $work || $this->visibility->works([$workId], $adult) === []) {
            return null;
        }
        $episode = $episodeId ? DB::table('catalog_episodes')->where(['id' => $episodeId, 'work_id' => $workId])->first() : null;
        if (($episodeId && ! $episode) || (! $episode && $work->format !== 'MOVIE')) {
            return null;
        }
        $season = $episode?->season_id ? DB::table('catalog_seasons')->where(['id' => $episode->season_id, 'work_id' => $workId])->first() : null;
        $references = DB::table('catalog_external_identities')->where('entity_id', $workId)->orderBy('provider')->orderBy('namespace')->get(['provider', 'namespace', 'external_id']);

        return ['schema' => 1, 'workId' => $workId, 'episodeId' => $episode?->id, 'seasonId' => $season?->id,
            'title' => $work->title, 'titleEnglish' => DB::table('catalog_entity_titles')->where(['entity_id' => $workId, 'locale' => 'en'])->value('title') ?? '',
            'episode' => $episode?->number ?? 1, 'season' => $season?->number, 'format' => $work->format ?? '', 'episodeCount' => $work->episode_count,
            'references' => $references->map(fn (object $reference) => ['provider' => $reference->provider, 'namespace' => $reference->namespace, 'id' => $reference->external_id])->all()];
    }
}
