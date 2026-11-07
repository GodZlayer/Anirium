<?php

namespace App\Console\Concerns;

use App\Support\CatalogPipelineProcessLock;
use Illuminate\Support\Facades\Cache;

trait LocksCatalogPipeline
{
    private function withCatalogPipelineLock(callable $operation): int
    {
        $processLock = new CatalogPipelineProcessLock;
        if (! $processLock->acquire()) {
            $this->warn('Outro processo do catálogo está em execução.');

            return self::FAILURE;
        }
        try {
            return $this->withCatalogCacheLock($operation);
        } finally {
            $processLock->release();
        }
    }

    private function withCatalogCacheLock(callable $operation): int
    {
        $lock = Cache::lock('anirium-catalog-pipeline', 7200);
        if (! $lock->get()) {
            $this->warn('Outro processo do catálogo está em execução.');

            return self::FAILURE;
        }
        try {
            return $operation();
        } finally {
            $lock->release();
        }
    }
}
