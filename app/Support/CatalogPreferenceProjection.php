<?php

namespace App\Support;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CatalogPreferenceProjection
{
    public function apply(Collection $preferences): Collection
    {
        $episodes = collect();
        foreach ($preferences->where('target_type', 'episode')->pluck('entity_id')->filter()->unique()->chunk(250) as $ids) {
            $episodes = $episodes->union(DB::table('catalog_episodes')->whereIn('id', $ids)->get(['id', 'work_id', 'number'])->keyBy('id'));
        }

        return $preferences->map(function (object $preference) use ($episodes): object {
            $row = clone $preference;
            $episode = $episodes->get($row->entity_id ?? '');
            if ($episode) {
                $row->work_id = $episode->work_id;
                $row->episode_number = $episode->number;
            }

            return $row;
        });
    }
}
