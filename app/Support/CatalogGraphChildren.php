<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogGraphChildren
{
    public function __construct(private CatalogIdentityStore $identities, private CatalogEpisodeStore $episodes) {}

    public function import(string $workId, string $universeId, array $record): void
    {
        $known = [];
        foreach ($record['episodes'] ?? [] as $episode) {
            $seasonId = null;
            if (($episode['tvdb_season'] ?? 0) > 0) {
                $number = $episode['tvdb_season'];
                $existing = DB::table('catalog_seasons')->where(['work_id' => $workId, 'number' => $number])->value('id');
                $seasonId = $this->identities->create('season', ['work:'.$workId.':source-season:'.$number], $existing);
                DB::table('catalog_seasons')->insertOrIgnore(['id' => $seasonId, 'work_id' => $workId, 'number' => $number]);
            }
            $aliases = [];
            foreach ($record['aliases'] as $alias) {
                $aliases[] = $alias.':ep-'.$episode['number'];
                $aliases[] = 'episode:'.$alias.':ep-'.$episode['number'];
            }
            $external = ($episode['tvdb_episode_id'] ?? null) ? ['tvdb', 'anime:episode:work:'.$workId, (string) $episode['tvdb_episode_id']] : null;
            $id = $this->episodes->put($workId, $episode['number'], $aliases, $external, $seasonId);
            DB::table('catalog_episodes')->where('id', $id)->update(['air_date_utc' => $episode['air_date_utc'] ?? null, 'classification' => $episode['classification'] ?? 'unknown']);
            foreach ($episode['titles'] ?? [] as $locale => $title) {
                DB::table('catalog_entity_titles')->updateOrInsert(['entity_id' => $id, 'locale' => $locale], ['title' => $title]);
            }
            $known[$episode['number']] = $id;
        }
        foreach ($record['arcs'] ?? [] as $arc) {
            $id = $this->identities->create('arc', ['work:'.$workId.':source-arc:'.$arc['arcId']]);
            DB::table('catalog_arcs')->updateOrInsert(['id' => $id], ['universe_id' => $universeId, 'title' => $arc['name'], 'classification' => $arc['classification'] ?? 'unknown', 'source_url' => $arc['source_url']]);
            DB::table('catalog_arc_works')->updateOrInsert(['arc_id' => $id, 'work_id' => $workId], ['universe_id' => $universeId, 'start_number' => $arc['startEp'], 'end_number' => $arc['endEp']]);
            foreach ($known as $number => $episodeId) {
                if ($number >= $arc['startEp'] && $number <= $arc['endEp']) {
                    DB::table('catalog_arc_episodes')->insertOrIgnore(['arc_id' => $id, 'episode_id' => $episodeId, 'universe_id' => $universeId, 'work_id' => $workId]);
                }
            }
        }
    }
}
