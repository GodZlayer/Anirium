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

        // Detecta temporada no título se a entidade season não existir no grafo
        $seasonNum = $season?->number;
        if (! $seasonNum) {
            if (preg_match('/(?:(\d+)(?:st|nd|rd|th)?\s+season)|(?:season\s+(\d+))|(?:temporada\s+(\d+))|(?:\bS(\d+)\b)|(?:\s+(\d+)\b$)/i', (string) $work->title, $m)) {
                $seasonNum = (int) ($m[1] ?: $m[2] ?: $m[3] ?: $m[4] ?: $m[5]);
            } else {
                $seasonNum = 1;
            }
        }

        $titleRows = DB::table('catalog_entity_titles')->where('entity_id', $workId)->get(['locale', 'title']);
        $byLocale = [];
        foreach ($titleRows as $row) {
            $loc = strtolower((string) $row->locale);
            $val = trim((string) $row->title);
            if ($val !== '' && ! isset($byLocale[$loc])) {
                $byLocale[$loc] = $val;
            }
        }

        $titleEnglish = $byLocale['en'] ?? '';
        $titleRomaji = '';
        foreach (['x-jat', 'ja-latn', 'zh-latn', 'ko-latn', 'romaji', 'und'] as $loc) {
            if (! empty($byLocale[$loc])) {
                $titleRomaji = $byLocale[$loc];
                break;
            }
        }
        $titleNative = '';
        foreach (['ja', 'zh', 'zh-hans', 'zh-hant', 'ko'] as $loc) {
            if (! empty($byLocale[$loc])) {
                $titleNative = $byLocale[$loc];
                break;
            }
        }

        $aliases = [];
        foreach ($titleRows as $row) {
            $val = trim((string) $row->title);
            if ($val !== '' && ! in_array($val, $aliases, true)) {
                $aliases[] = $val;
            }
            if (count($aliases) >= 24) {
                break;
            }
        }

        return ['schema' => 1, 'workId' => $workId, 'episodeId' => $episode?->id, 'seasonId' => $season?->id,
            'title' => $work->title, 'titleEnglish' => $titleEnglish ?: $work->title, 'titleRomaji' => $titleRomaji ?: $work->title,
            'titleNative' => $titleNative, 'aliases' => $aliases,
            'episode' => $episode?->number ?? 1, 'season' => $seasonNum, 'format' => $work->format ?? '', 'episodeCount' => $work->episode_count,
            'references' => $references->map(fn (object $reference) => ['provider' => $reference->provider, 'namespace' => $reference->namespace, 'id' => $reference->external_id])->all()];
    }
}
