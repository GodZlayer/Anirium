<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogUserCompletion
{
    public function __construct(private CatalogWorkCompletion $completion) {}

    public function read(int $user): array
    {
        $preferences = DB::table('user_entity_preferences as p')->join('catalog_entities as entity', 'entity.id', '=', 'p.entity_id')
            ->where('p.user_id', $user)->where('p.status', 'completed')->where('entity.resolution_status', 'verified')
            ->whereColumn('p.target_type', 'entity.kind')->get(['p.entity_id', 'p.target_type']);
        $watched = $preferences->where('target_type', 'episode')->pluck('entity_id')->unique()->all();
        $marked = $preferences->where('target_type', 'work')->pluck('entity_id')->unique()->all();
        $workIds = collect($marked);
        foreach (array_chunk($watched, 250) as $chunk) {
            $workIds = $workIds->merge(DB::table('catalog_episodes')->whereIn('id', $chunk)->pluck('work_id'));
        }
        $sets = ['episodes' => [], 'seasons' => [], 'arcs' => [], 'works' => [], 'universes' => []];
        $arcParts = [];
        foreach ($workIds->unique()->chunk(250) as $chunk) {
            $works = DB::table('catalog_works')->where('media', 'anime')->whereIn('id', $chunk)->get();
            foreach ($works as $work) {
                $result = $this->completion->read($work, $watched, in_array($work->id, $marked, true));
                foreach (['episodes', 'seasons', 'arcs'] as $kind) {
                    $sets[$kind] = [...$sets[$kind], ...$result[$kind]];
                }
                foreach ($result['arcs'] as $arc) {
                    $arcParts[$arc][] = $work->id;
                }
                if ($result['complete']) {
                    $sets['works'][] = $work->id;
                }
            }
        }
        $sets['arcs'] = array_values(array_filter(array_unique($sets['arcs']), function ($arc) use ($arcParts) {
            $parts = DB::table('catalog_arc_works')->where('arc_id', $arc)->pluck('work_id')->all();

            return $parts !== [] && array_diff($parts, $arcParts[$arc]) === [];
        }));
        $universes = collect();
        foreach (array_chunk($sets['works'], 250) as $chunk) {
            $universes = $universes->merge(DB::table('catalog_universe_works')->whereIn('work_id', $chunk)->pluck('universe_id'));
        }
        foreach ($universes->unique() as $universe) {
            $members = DB::table('catalog_universe_works as m')->join('catalog_works as w', 'w.id', '=', 'm.work_id')
                ->where('m.universe_id', $universe)->where('w.media', 'anime')->where(function ($query) {
                    $query->whereNull('w.status')->orWhere('w.status', '<>', 'NOT_YET_AIRED');
                })->pluck('w.id')->all();
            if ($members !== [] && array_diff($members, $sets['works']) === []) {
                $sets['universes'][] = $universe;
            }
        }
        $counts = [];
        foreach ($sets as $kind => $ids) {
            $counts[$kind] = count(array_unique($ids));
        }

        return ['schema' => 1, 'authority' => 'sql', 'observed_at' => now()->toISOString(), 'counts' => $counts, 'completed_universe_ids' => $sets['universes']];
    }
}
