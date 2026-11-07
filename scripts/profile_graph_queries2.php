<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$id = '59eff475-b7a0-4657-bf8f-c367fb1c3f8c';
$adult = false;

$s = microtime(true);
$visibility = app(\App\Support\CatalogGraphVisibility::class);
$vis = $visibility->works([$id], $adult);
echo "1. visibility->works: " . round((microtime(true) - $s) * 1000, 2) . "ms\n";

$s = microtime(true);
$episodes = \Illuminate\Support\Facades\DB::table('catalog_episodes')->where('work_id', $id)->orderBy('number')->get(['id', 'work_id', 'season_id', 'number', 'numbering_scheme', 'air_date_utc', 'classification']);
echo "2. episodes: " . round((microtime(true) - $s) * 1000, 2) . "ms (count: " . count($episodes) . ")\n";

$s = microtime(true);
$relations = \Illuminate\Support\Facades\DB::table('catalog_work_relations')->where('from_work_id', $id)->get(['to_work_id', 'relation_type', 'provider']);
echo "3. relations: " . round((microtime(true) - $s) * 1000, 2) . "ms\n";

$s = microtime(true);
$arcs = \Illuminate\Support\Facades\DB::table('catalog_arcs as arc')->join('catalog_arc_works as link', 'arc.id', '=', 'link.arc_id')
    ->where('link.work_id', $id)->distinct()->orderBy('arc.id')->get(['arc.id', 'arc.universe_id', 'arc.title', 'arc.classification', 'arc.source_url', 'link.start_number', 'link.end_number']);
echo "4. arcs: " . round((microtime(true) - $s) * 1000, 2) . "ms (count: " . count($arcs) . ")\n";

$s = microtime(true);
$arcEpisodes = \Illuminate\Support\Facades\DB::table('catalog_arc_episodes')->where('work_id', $id)->get(['arc_id', 'episode_id']);
echo "5. arcEpisodes: " . round((microtime(true) - $s) * 1000, 2) . "ms (count: " . count($arcEpisodes) . ")\n";

$s = microtime(true);
$arcAliases = \Illuminate\Support\Facades\DB::table('catalog_entity_aliases')->where('kind', 'arc')->whereIn('entity_id', $arcs->pluck('id'))->get(['entity_id', 'alias']);
echo "6. arcAliases: " . round((microtime(true) - $s) * 1000, 2) . "ms\n";
