<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class CatalogEpisodeFeed
{
    public function read(CatalogSearch $catalog, string $generation, bool $adult): array
    {
        $base = DB::table('catalog_episodes as e')->join('catalog_works as w', 'w.id', '=', 'e.work_id')
            ->join('catalog_entities as entity', 'entity.id', '=', 'e.id')
            ->where('w.media', 'anime')->where('entity.kind', 'episode')->where('entity.resolution_status', 'verified')
            ->whereRaw("e.air_date_utc GLOB '????-??-??[T ]??:??:*'");
        $now = now()->toISOString();
        $query = (clone $base)->whereRaw('julianday(e.air_date_utc) <= julianday(?)', [$now])
            ->orderByRaw('julianday(e.air_date_utc) DESC')->orderBy('e.id');
        $items = [];
        for ($offset = 0; count($items) < 3; $offset += 250) {
            $episodes = $query->offset($offset)->limit(250)->get(['e.id', 'e.work_id', 'e.number', 'e.air_date_utc']);
            if ($episodes->isEmpty()) {
                break;
            }
            $summaries = $catalog->summaries($episodes->pluck('work_id')->unique()->map(fn ($id) => 'work:'.$id)->all(), $adult);
            if ($summaries['generation'] !== $generation) {
                throw new CatalogUnavailable('Catalog changed during episode feed selection');
            }
            foreach ($episodes as $episode) {
                $work = $summaries['resolved']['work:'.$episode->work_id]['summary'] ?? null;
                if (! $work || ($work['catalog_visibility'] ?? 'visible') !== 'visible') {
                    continue;
                }
                $items[] = [...$work, 'release' => ['id' => $episode->id, 'work_id' => $episode->work_id, 'number' => $episode->number, 'air_date_utc' => CarbonImmutable::parse($episode->air_date_utc, 'UTC')->utc()->toISOString()]];
                if (count($items) === 3) {
                    break;
                }
            }
            if ($episodes->count() < 250) {
                break;
            }
        }
        $next = (clone $base)->whereRaw('julianday(e.air_date_utc) > julianday(?)', [$now])->orderByRaw('julianday(e.air_date_utc)')->value('e.air_date_utc');

        return ['generation' => $generation, 'items' => $items, 'pages' => $items === [] ? 0 : 1, 'total' => count($items), 'next_release_at' => $next];
    }
}
