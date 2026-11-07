<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogImportCheckpoint
{
    public function __construct(private CatalogIdentityInput $input) {}

    public function read(array $source, string $path, string $mirror): array
    {
        $row = DB::table('catalog_identity_imports')->where('sha256', $source['sha256'])->first();
        if ($row) {
            if ($row->generation !== $source['generation'] || (int) $row->records !== $source['records']) {
                throw new DomainException('Database checkpoint does not match identity input');
            }

            return [...$source, 'works' => (int) $row->works, 'relations' => (int) $row->relations,
                'pending_relations' => (int) $row->pending_relations, 'complete' => (bool) $row->complete];
        }
        $state = [...$source, 'works' => 0, 'relations' => 0, 'pending_relations' => 0, 'complete' => false];
        if (is_file($mirror)) {
            $legacy = json_decode(file_get_contents($mirror), true, 512, JSON_THROW_ON_ERROR);
            if (($legacy['sha256'] ?? null) !== $source['sha256']) {
                throw new DomainException('Checkpoint belongs to another identity input');
            }
            $count = $legacy['works'] ?? null;
            if (! is_int($count) || $count < 0 || $count > $source['records']) {
                throw new DomainException('Invalid legacy checkpoint position');
            }
            $this->verifyPrefix($path, $count);
            $state['works'] = $count;
        }
        $this->write($state);

        return $state;
    }

    public function write(array $state): void
    {
        DB::table('catalog_identity_imports')->updateOrInsert(['sha256' => $state['sha256']], array_diff_key($state, ['sha256' => true]));
    }

    private function verifyPrefix(string $path, int $count): void
    {
        $batch = [];
        foreach ($this->input->works($path) as $record) {
            if ($count-- <= 0) {
                break;
            }
            $batch[$record['work_id']] = $record['media'];
            if (count($batch) === 250) {
                $this->verifyWorks($batch);
                $batch = [];
            }
        }
        $this->verifyWorks($batch);
    }

    private function verifyWorks(array $batch): void
    {
        $actual = DB::table('catalog_works')->whereIn('id', array_keys($batch))->pluck('media', 'id')->all();
        foreach ($batch as $id => $media) {
            if (($actual[$id] ?? null) !== $media) {
                throw new DomainException('Legacy checkpoint is ahead of database; restore matching state before resuming');
            }
        }
    }
}
