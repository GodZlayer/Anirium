<?php

use App\Support\CatalogSearch;
use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$root = storage_path('app/catalog/unified-candidate');
config(['catalog.manifest' => $root.'/data/catalog.manifest.json', 'catalog.indexes' => $root.'/indexes']);
$reports = [];
foreach (['anime', 'manga', 'novel', 'all'] as $media) {
    $started = microtime(true);
    $result = app(CatalogSearch::class)->search('Sword Art Online', $media, 1, false);
    $reports[$media] = ['total' => $result['total'], 'milliseconds' => round((microtime(true) - $started) * 1000),
        'items' => array_map(fn ($work) => array_intersect_key($work, array_flip(['work_id', 'mal_id', 'title', 'format', 'entity_type'])), $result['items'])];
}
file_put_contents($root.'/search-validation.json', json_encode($reports, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo json_encode($reports, JSON_UNESCAPED_UNICODE).PHP_EOL;
