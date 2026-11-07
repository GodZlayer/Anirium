<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogWorkGraph
{
    public function __construct(private CatalogGraphVisibility $visibility) {}

    public function read(string $id, bool $adult): ?array
    {
        $work = DB::table('catalog_works')->where('id', $id)->first();
        if (! $work || $this->visibility->works([$id], $adult) === []) {
            return null;
        }
        $episodes = DB::table('catalog_episodes')->where('work_id', $id)->orderBy('number')->get(['id', 'work_id', 'season_id', 'number', 'numbering_scheme', 'air_date_utc', 'classification']);
        $relations = DB::table('catalog_work_relations')->where('from_work_id', $id)->get(['to_work_id', 'relation_type', 'provider']);
        $visible = $this->visibility->works($relations->pluck('to_work_id')->all(), $adult);
        $arcs = DB::table('catalog_arcs as arc')->join('catalog_arc_works as link', 'arc.id', '=', 'link.arc_id')
            ->where('link.work_id', $id)->distinct()->orderBy('arc.id')->get(['arc.id', 'arc.universe_id', 'arc.title', 'arc.classification', 'arc.source_url', 'link.start_number', 'link.end_number']);
        $arcEpisodes = DB::table('catalog_arc_episodes')->where('work_id', $id)->get(['arc_id', 'episode_id']);
        $arcAliases = DB::table('catalog_entity_aliases')->where('kind', 'arc')->whereIn('entity_id', $arcs->pluck('id'))->get(['entity_id', 'alias']);

        return [
            'schema' => 1, 'entity' => ['kind' => 'work', ...(array) $work],
            'universe_ids' => DB::table('catalog_universe_works')->where('work_id', $id)->orderBy('universe_id')->pluck('universe_id')->all(),
            'seasons' => DB::table('catalog_seasons')->where('work_id', $id)->orderBy('number')->get(['id', 'work_id', 'number'])->all(),
            'episodes' => $episodes->all(),
            'arcs' => $arcs->map(fn (object $arc) => [...(array) $arc,
                'aliases' => $arcAliases->where('entity_id', $arc->id)->pluck('alias')->all(),
                'episode_ids' => $arcEpisodes->where('arc_id', $arc->id)->pluck('episode_id')->all()])->all(),
            'relations' => $relations->filter(fn (object $relation) => in_array($relation->to_work_id, $visible, true))->values()->all(),
            'capabilities' => ['episodes' => $episodes->isNotEmpty(), 'seasons' => DB::table('catalog_seasons')->where('work_id', $id)->exists(), 'arcs' => $arcs->isNotEmpty()],
        ];
    }
}
