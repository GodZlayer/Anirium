<?php

use App\Services\Catalog\CatalogVisibilityService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$id = '59eff475-b7a0-4657-bf8f-c367fb1c3f8c';
$adult = false;

$s = microtime(true);
$work = DB::table('catalog_works')->where('id', $id)->first();
echo 'work: '.round((microtime(true) - $s) * 1000, 2)."ms\n";

$s = microtime(true);
$visibility = app(CatalogVisibilityService::class);
$vis = $visibility->works([$id], $adult);
echo 'visibility->works: '.round((microtime(true) - $s) * 1000, 2)."ms\n";

$s = microtime(true);
$episodes = DB::table('catalog_episodes')->where('work_id', $id)->orderBy('number')->get(['id', 'work_id', 'season_id', 'number', 'numbering_scheme', 'air_date_utc', 'classification']);
echo 'episodes: '.round((microtime(true) - $s) * 1000, 2).'ms (count: '.count($episodes).")\n";

$s = microtime(true);
$relations = DB::table('catalog_work_relations')->where('from_work_id', $id)->get(['to_work_id', 'relation_type', 'provider']);
echo 'relations: '.round((microtime(true) - $s) * 1000, 2)."ms\n";

$s = microtime(true);
$visible = $visibility->works($relations->pluck('to_work_id')->all(), $adult);
echo 'visibility of relations: '.round((microtime(true) - $s) * 1000, 2)."ms\n";

$s = microtime(true);
$arcs = DB::table('catalog_arcs as arc')->join('catalog_arc_works as link', 'arc.id', '=', 'link.arc_id')
    ->where('link.work_id', $id)->distinct()->orderBy('arc.id')->get(['arc.id', 'arc.universe_id', 'arc.title', 'arc.classification', 'arc.source_url', 'link.start_number', 'link.end_number']);
echo 'arcs: '.round((microtime(true) - $s) * 1000, 2).'ms (count: '.count($arcs).")\n";

$s = microtime(true);
$arcEpisodes = DB::table('catalog_arc_episodes')->where('work_id', $id)->get(['arc_id', 'episode_id']);
echo 'arcEpisodes: '.round((microtime(true) - $s) * 1000, 2).'ms (count: '.count($arcEpisodes).")\n";

$s = microtime(true);
$arcAliases = DB::table('catalog_entity_aliases')->where('kind', 'arc')->whereIn('entity_id', $arcs->pluck('id'))->get(['entity_id', 'alias']);
echo 'arcAliases: '.round((microtime(true) - $s) * 1000, 2)."ms\n";
