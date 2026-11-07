<?php

return [
    'registry_archives' => storage_path('app/catalog/published/registries'),
    'pipeline_lock_path' => storage_path('framework/cache/catalog-pipeline.lock'),
    'heap_mb' => env('CATALOG_HEAP_MB', 6144),
    'manifest' => public_path('data/catalog.manifest.json'),
    'indexes' => storage_path('app/catalog/published/indexes'),
];
