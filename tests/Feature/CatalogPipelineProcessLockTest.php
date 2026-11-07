<?php

namespace Tests\Feature;

use App\Support\CatalogPipelineProcessLock;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class CatalogPipelineProcessLockTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.pipeline_lock_path' => storage_path('framework/testing/pipeline-'.bin2hex(random_bytes(8)).'.lock')]);
    }

    protected function tearDown(): void
    {
        @unlink(config('catalog.pipeline_lock_path'));
        parent::tearDown();
    }

    public function test_live_process_lock_blocks_even_after_cache_expiration(): void
    {
        $owner = new CatalogPipelineProcessLock;
        $this->assertTrue($owner->acquire());
        Cache::forget('anirium-catalog-pipeline');
        Process::fake();
        try {
            $this->artisan('catalog:candidate sync')->assertFailed();
            $this->artisan('catalog:sync')->assertFailed();
            Process::assertNothingRan();
            $other = new CatalogPipelineProcessLock;
            $this->assertFalse($other->acquire());
            $owner->release();
            $this->assertTrue($other->acquire());
            $other->release();
        } finally {
            $owner->release();
        }
    }

    public function test_failed_operation_releases_process_lock_for_next_run(): void
    {
        Process::fake(['*' => Process::result(exitCode: 1)]);
        $this->artisan('catalog:candidate sync')->assertFailed();
        Process::fake(['*' => Process::result(exitCode: 0)]);
        $this->artisan('catalog:candidate sync')->assertSuccessful();
    }
}
