<?php

namespace Tests\Feature;

use App\Support\AtomicFileCache;
use Illuminate\Cache\RateLimiter;
use Illuminate\Cache\Repository;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class AtomicFileCacheTest extends TestCase
{
    public function test_limits_expire_and_parallel_increments_are_not_lost(): void
    {
        $directory = storage_path('framework/testing/limiter-'.Str::uuid());
        File::ensureDirectoryExists($directory);
        try {
            $store = new AtomicFileCache(new Filesystem, $directory, null, false);
            $limiter = new RateLimiter(new Repository($store));
            for ($i = 0; $i < 3; $i++) {
                $limiter->hit('limit', 60);
            }
            $this->assertTrue($limiter->tooManyAttempts('limit', 3));
            $this->travel(61)->seconds();
            $this->assertFalse($limiter->tooManyAttempts('limit', 3));
            $this->travelBack();
            $store->put('parallel', 0, 60);
            $script = $directory.'/increment.php';
            File::put($script, '<?php require '.var_export(base_path('vendor/autoload.php'), true).'; $s=new \\App\\Support\\AtomicFileCache(new \\Illuminate\\Filesystem\\Filesystem, $argv[1], null, false); for($i=0;$i<10;$i++) $s->increment("parallel");');
            $processes = [];
            for ($i = 0; $i < 4; $i++) {
                $processes[] = $process = new Process([PHP_BINARY, $script, $directory]);
                $process->setTimeout(30)->start();
            }
            foreach ($processes as $process) {
                $process->wait();
                $this->assertTrue($process->isSuccessful(), $process->getErrorOutput());
            }
            $this->assertSame(40, $store->get('parallel'));
        } finally {
            $this->assertStringStartsWith(realpath(storage_path('framework/testing')).DIRECTORY_SEPARATOR, realpath($directory));
            File::deleteDirectory($directory);
        }
    }
}
