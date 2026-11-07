<?php

namespace App\Support;

use DomainException;
use Generator;
use Illuminate\Support\Str;
use SplFileObject;

class CatalogIdentityInput
{
    public function inspect(string $path): array
    {
        $header = null;
        $end = null;
        $count = 0;
        foreach ($this->lines($path) as $record) {
            if ($end !== null) {
                throw new DomainException('Records after identity input footer');
            }
            if ($header === null) {
                $header = $record;
                if (($header['type'] ?? '') !== 'manifest' || ($header['schema'] ?? null) !== 1 || ! Str::isUuid($header['generation'] ?? '')) {
                    throw new DomainException('Invalid identity input manifest');
                }
            } elseif (($record['type'] ?? '') === 'end') {
                $end = $record;
            } elseif (($record['type'] ?? '') === 'work' && Str::isUuid($record['work_id'] ?? '')) {
                $count++;
            } else {
                throw new DomainException('Invalid identity input record');
            }
        }
        if ($count === 0 || ($end['records'] ?? null) !== $count) {
            throw new DomainException('Incomplete identity input');
        }

        return ['generation' => $header['generation'], 'records' => $count, 'sha256' => hash_file('sha256', $path)];
    }

    public function works(string $path): Generator
    {
        foreach ($this->lines($path) as $record) {
            if (($record['type'] ?? '') === 'work') {
                yield $record;
            }
        }
    }

    private function lines(string $path): Generator
    {
        $file = new SplFileObject($path, 'r');
        while (! $file->eof()) {
            $line = trim($file->fgets());
            if ($line !== '') {
                $record = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
                if (! is_array($record)) {
                    throw new DomainException('Invalid identity input document');
                }
                yield $record;
            }
        }
    }
}
