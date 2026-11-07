<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogWorkCompletion
{
    public function read(object $work, array $watched, bool $workMarked): array
    {
        $known = DB::table('catalog_episodes')->where('work_id', $work->id)->where('numbering_scheme', 'original')->orderBy('number')->get();
        $released = $known->filter(function (object $episode) use ($work): bool {
            if ($episode->air_date_utc !== null) {
                $time = strtotime($episode->air_date_utc);

                return $time !== false && $time <= now()->timestamp;
            }

            return $work->status === 'FINISHED';
        });
        $done = $released->whereIn('id', $watched);
        $coverage = $released->isNotEmpty() && $released->count() === (int) $released->max('number');
        if ($work->status === 'FINISHED') {
            $coverage = $coverage && $work->episode_count > 0 && $released->count() === (int) $work->episode_count;
        } elseif ($work->status !== 'RELEASING') {
            $coverage = false;
        }
        $complete = $coverage && $done->count() === $released->count();
        if ($known->isEmpty() && $work->format === 'MOVIE' && $work->status === 'FINISHED') {
            $complete = $workMarked;
        }
        $seasons = $coverage ? $released->filter(fn ($episode) => $episode->season_id !== null)->groupBy('season_id')
            ->filter(fn ($episodes) => $episodes->every(fn ($episode) => in_array($episode->id, $watched, true)))->keys()->all() : [];
        $arcs = [];
        foreach (DB::table('catalog_arc_works')->where('work_id', $work->id)->get() as $arc) {
            if ($arc->start_number === null || $arc->end_number === null) {
                continue;
            }
            $members = $released->whereBetween('number', [$arc->start_number, $arc->end_number]);
            $linked = DB::table('catalog_arc_episodes')->where('arc_id', $arc->arc_id)->where('work_id', $work->id)->pluck('episode_id')->all();
            if ($members->count() === $arc->end_number - $arc->start_number + 1
                && $members->every(fn ($episode) => in_array($episode->id, $watched, true) && in_array($episode->id, $linked, true))) {
                $arcs[] = $arc->arc_id;
            }
        }

        return ['complete' => $complete, 'episodes' => $done->pluck('id')->all(), 'seasons' => $seasons, 'arcs' => $arcs];
    }
}
