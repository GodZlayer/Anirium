<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$id = '59eff475-b7a0-4657-bf8f-c367fb1c3f8c';
$allowAdult = false;

// Step 1: Cache check
$s = microtime(true);
$cacheKey = "catalog:work:graph:payload:v2:{$id}:" . ($allowAdult ? '1' : '0');
$cached = \Illuminate\Support\Facades\Cache::get($cacheKey);
echo "Step 1 (Cache::get): " . round((microtime(true) - $s) * 1000, 2) . "ms | Cached: " . ($cached ? 'YES' : 'NO') . "\n";

// Step 2: If null, run graph->read
if (!$cached) {
    $s = microtime(true);
    $graph = app(\App\Services\Graph\CatalogWorkGraph::class);
    $res = $graph->read($id, $allowAdult);
    echo "Step 2 (graph->read): " . round((microtime(true) - $s) * 1000, 2) . "ms\n";
} else {
    $res = $cached;
}

// Step 3: View compilation
$s = microtime(true);
$workObj = (object) ($res['entity'] ?? []);
$arcsObj = collect($res['arcs'] ?? [])->map(fn($a) => (object)$a);
$episodesObj = collect($res['episodes'] ?? [])->map(fn($e) => (object)$e);
$creators = collect($res['creators'] ?? [])->map(fn($c) => (object)$c);
$studios = collect($res['studios'] ?? [])->map(fn($s) => (object)$s);
$tracks = collect($res['tracks'] ?? [])->map(fn($t) => (object)$t);
$universe = !empty($res['universe']) ? (object)$res['universe'] : null;

$html = view('partials.context-card', [
    'work' => $workObj,
    'universe' => $universe,
    'creators' => $creators,
    'studios' => $studios,
    'tracks' => $tracks,
    'arcs' => $arcsObj,
    'episodes' => $episodesObj,
    'isLiked' => false,
    'isBookmarked' => false,
    'userScore' => null,
    'userStatus' => null,
    'isWatched' => false,
])->render();
echo "Step 3 (view render): " . round((microtime(true) - $s) * 1000, 2) . "ms | HTML length: " . strlen($html) . "\n";
