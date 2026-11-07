<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class CatalogCandidateCommandTest extends TestCase
{
    public function test_invalid_action_cannot_start_a_process(): void
    {
        Process::fake();
        $this->artisan('catalog:candidate delete')->assertFailed();
        Process::assertNothingRan();
    }

    public function test_candidate_arguments_are_passed_without_shell_interpolation(): void
    {
        Process::fake(['*' => Process::result(exitCode: 0)]);
        $this->artisan('catalog:candidate', ['action' => 'audit', '--output' => 'storage/private candidate'])->assertSuccessful();
        Process::assertRan(fn ($process) => $process->command === [
            'node', '--max-old-space-size=6144', base_path('scripts/catalog-candidate.mjs'), 'audit', '--output=storage/private candidate',
        ] && $process->path === base_path());
    }

    public function test_cached_repair_uses_the_same_command_boundary(): void
    {
        Process::fake(['*' => Process::result(exitCode: 0)]);
        $this->artisan('catalog:candidate repair')->assertSuccessful();
        Process::assertRan(fn ($process) => $process->command === ['node', '--max-old-space-size=6144', base_path('scripts/catalog-candidate.mjs'), 'repair']);
    }

    public function test_failed_candidate_does_not_report_success(): void
    {
        Process::fake(['*' => Process::result(exitCode: 1)]);
        $this->artisan('catalog:candidate sync')->assertFailed();
    }

    public function test_shared_pipeline_lock_blocks_writes_but_keeps_status_readable(): void
    {
        $lock = Cache::lock('anirium-catalog-pipeline', 60);
        $this->assertTrue($lock->get());
        try {
            Process::fake(['*' => Process::result(exitCode: 0)]);
            $this->artisan('catalog:candidate sync')->assertFailed();
            $this->artisan('catalog:candidate repair')->assertFailed();
            $this->artisan('catalog:sync')->assertFailed();
            Process::assertNothingRan();
            $this->artisan('catalog:candidate status')->assertSuccessful();
        } finally {
            $lock->release();
        }
    }
}
