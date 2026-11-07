<?php

namespace Tests\Feature;

use Illuminate\Console\CommandMutex;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class CatalogSyncCommandTest extends TestCase
{
    public function test_another_catalog_run_prevents_starting_a_second_process(): void
    {
        $mutex = \Mockery::mock(CommandMutex::class);
        $mutex->shouldReceive('create')->once()->andReturn(false);
        $this->app->instance(CommandMutex::class, $mutex);
        Process::fake();
        $this->artisan('catalog:sync')->assertFailed();
        Process::assertNothingRan();
    }

    public function test_sync_uses_only_the_canonical_pipeline(): void
    {
        Process::fake(['*' => Process::result(exitCode: 0)]);
        $this->artisan('catalog:sync')->assertSuccessful();
        Process::assertRan(fn ($process) => $process->command === ['node', '--max-old-space-size=6144', base_path('scripts/catalog-candidate.mjs'), 'auto']
            && $process->environment['CATALOG_IDENTITY_DATABASE'] === ':memory:');
    }

    public function test_sync_process_failure_is_reported_as_command_failure(): void
    {
        Process::fake(['*' => Process::result(errorOutput: 'Fixture upstream failure', exitCode: 1)]);
        $this->artisan('catalog:sync')->assertFailed();
        Process::assertRan(fn ($process) => $process->command === ['node', '--max-old-space-size=6144', base_path('scripts/catalog-candidate.mjs'), 'auto'] && $process->path === base_path());
    }

    public function test_success_requires_successful_sync_process(): void
    {
        Process::fake(['*' => Process::result(output: 'Fixture published', exitCode: 0)]);
        $this->artisan('catalog:sync')->assertSuccessful();
        Process::assertRanTimes(['node', '--max-old-space-size=6144', base_path('scripts/catalog-candidate.mjs'), 'auto'], 1);
    }
}
