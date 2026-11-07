<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class CatalogIdentityImportRun
{
    public function __construct(private CatalogIdentityInput $input, private CatalogGraphImporter $importer, private CatalogDatabaseRetry $retry, private CatalogImportCheckpoint $checkpoints, private CatalogImportedArcRepair $arcs) {}

    public function run(string $path, string $checkpoint, callable $progress): array
    {
        $source = $this->input->inspect($path);
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::statement('PRAGMA cache_size=-65536');
        }
        $state = $this->checkpoints->read($source, $path, $checkpoint);
        if ($state['relations'] === $source['records'] && $state['pending_relations'] > 0) {
            $state['relations'] = 0;
            $state['pending_relations'] = 0;
        }
        foreach (['works', 'relations'] as $phase) {
            $position = 0;
            $batch = [];
            foreach ($this->input->works($path) as $record) {
                $position++;
                if ($position <= $state[$phase]) {
                    continue;
                }
                $batch[] = $record;
                if (count($batch) === 250) {
                    $state = $this->batch($batch, $phase, $state, $position);
                    $batch = [];
                    $this->save($checkpoint, $state);
                    $progress($phase, $state);
                }
            }
            if ($batch !== []) {
                $state = $this->batch($batch, $phase, $state, $position);
            }
            $this->save($checkpoint, $state);
        }
        $state['complete'] = $state['pending_relations'] === 0;
        $this->checkpoints->write($state);
        $this->save($checkpoint, $state);

        return $state;
    }

    private function batch(array $records, string $phase, array $state, int $position): array
    {
        return $this->retry->run(fn () => DB::transaction(function () use ($records, $phase, $state, $position): array {
            foreach ($records as $record) {
                if ($phase === 'works') {
                    $this->importer->work($record);
                } else {
                    $this->arcs->record($record);
                    $state['pending_relations'] += $this->importer->relations($record);
                }
            }
            $state[$phase] = $position;
            $this->checkpoints->write($state);

            return $state;
        }));
    }

    private function save(string $path, array $state): void
    {
        File::ensureDirectoryExists(dirname($path));
        File::replace($path, json_encode($state, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT));
    }
}
