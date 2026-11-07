<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CatalogContextLookup
{
    public function __construct(private CatalogGraphVisibility $visibility) {}

    public function resolve(string $kind, string $id, bool $adult, ?string $preferredWork = null): ?array
    {
        $id = strtolower($id);
        if (! in_array($kind, CatalogIdentityStore::KINDS, true) || ! Str::isUuid($id)
            || ! DB::table('catalog_entities')->where(['id' => $id, 'kind' => $kind, 'resolution_status' => 'verified'])->exists()) {
            return null;
        }
        $selection = [];
        if ($kind === 'work') {
            $works = DB::table('catalog_works')->where('id', $id)->pluck('id')->all();
        } elseif (in_array($kind, ['episode', 'season'], true)) {
            $row = DB::table('catalog_'.$kind.'s')->where('id', $id)->first();
            if (! $row) {
                return null;
            }
            $works = [$row->work_id];
            $selection = [$kind.'_id' => $id, $kind.'_number' => $row->number];
            if ($kind === 'episode') {
                $selection['season_id'] = $row->season_id;
            }
        } else {
            $table = $kind === 'universe' ? 'catalog_universe_works' : 'catalog_arc_works';
            $column = $kind === 'universe' ? 'universe_id' : 'arc_id';
            $works = DB::table($table)->where($column, $id)->orderBy('work_id')->pluck('work_id')->all();
        }
        $visible = $this->visibility->works($works, $adult);
        sort($visible, SORT_STRING);
        $workId = $preferredWork !== null ? strtolower($preferredWork) : ($visible[0] ?? null);
        if ($workId === null || ! in_array($workId, $visible, true)) {
            return null;
        }
        if ($kind === 'arc') {
            $prefix = 'work:'.$workId.':source-arc:';
            $alias = DB::table('catalog_entity_aliases')->where(['kind' => 'arc', 'entity_id' => $id])->where('alias', 'like', $prefix.'%')->orderBy('alias')->value('alias');
            $selection = ['arc_id' => $id, 'arc_reference' => $alias ? substr($alias, strlen($prefix)) : null];
            $selection['episode_number'] = DB::table('catalog_arc_episodes as link')->join('catalog_episodes as episode', 'link.episode_id', '=', 'episode.id')
                ->where('link.arc_id', $id)->where('link.work_id', $workId)->min('episode.number');
        }
        if ($kind === 'season') {
            $selection['episode_number'] = DB::table('catalog_episodes')->where('season_id', $id)->min('number');
        }

        return ['schema' => 1, 'entity' => ['id' => $id, 'kind' => $kind], 'work_id' => $workId, 'selection' => $selection];
    }
}
