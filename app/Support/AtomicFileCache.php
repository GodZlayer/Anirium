<?php

namespace App\Support;

use Illuminate\Cache\FileStore;

class AtomicFileCache extends FileStore
{
    public function increment($key, $value = 1)
    {
        return $this->lock('counter:'.$key, 10)->block(5, fn () => parent::increment($key, $value));
    }
}
