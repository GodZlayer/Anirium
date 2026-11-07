<?php

namespace App\Support;

class CatalogPipelineProcessLock
{
    private mixed $handle = null;

    public function acquire(): bool
    {
        $path = config('catalog.pipeline_lock_path', storage_path('framework/cache/catalog-pipeline.lock'));
        if (! is_dir(dirname($path)) && ! @mkdir(dirname($path), 0775, true) && ! is_dir(dirname($path))) {
            throw new \RuntimeException('Cannot create catalog process lock directory');
        }
        $handle = fopen($path, 'c');
        if ($handle === false) {
            throw new \RuntimeException('Cannot open catalog process lock');
        }
        if (! flock($handle, LOCK_EX | LOCK_NB)) {
            fclose($handle);

            return false;
        }
        $this->handle = $handle;

        return true;
    }

    public function release(): void
    {
        if (is_resource($this->handle)) {
            flock($this->handle, LOCK_UN);
            fclose($this->handle);
        }
        $this->handle = null;
    }

    public function __destruct()
    {
        $this->release();
    }
}
