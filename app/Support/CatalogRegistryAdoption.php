<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

class CatalogRegistryAdoption
{
    public function forGeneration(string $generation): array
    {
        if (! Str::isUuid($generation)) {
            throw new DomainException('Invalid imported generation');
        }

        return $this->run(config('catalog.registry_archives', storage_path('app/catalog/published/registries')).DIRECTORY_SEPARATOR.$generation.'.json');
    }

    public function run(string $file): array
    {
        $path = realpath($file);
        $root = realpath(config('catalog.registry_archives', storage_path('app/catalog/published/registries')));
        if (! $path || ! $root || ! str_starts_with($path, $root.DIRECTORY_SEPARATOR) || DB::connection()->getDriverName() !== 'sqlite') {
            throw new DomainException('A private archived registry and SQLite connection are required');
        }
        $result = Process::path(base_path())->env(['CATALOG_IDENTITY_DATABASE' => DB::connection()->getDatabaseName()])
            ->timeout(7200)->run(['node', '--max-old-space-size=6144', base_path('scripts/adopt-catalog-registry.mjs'), $path]);
        if (! $result->successful()) {
            throw new DomainException('Registry metadata adoption failed: '.$result->errorOutput());
        }
        $report = json_decode($result->output(), true, 512, JSON_THROW_ON_ERROR);
        if (! is_int($report['works'] ?? null) || ! is_int($report['redirects'] ?? null)) {
            throw new DomainException('Invalid registry metadata adoption report');
        }

        return $report;
    }
}
