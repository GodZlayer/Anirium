<?php

namespace Tests\Feature;

use App\Support\CatalogIdentityImportRun;
use App\Support\CatalogIdentityInput;
use App\Support\CatalogImportCheckpoint;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogImportCheckpointTest extends TestCase
{
    use RefreshDatabase;

    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        $this->path = tempnam(sys_get_temp_dir(), 'identity-checkpoint-');
        $records = [['type' => 'manifest', 'schema' => 1, 'generation' => (string) Str::uuid()]];
        foreach (range(1, 2) as $number) {
            $records[] = ['type' => 'work', 'work_id' => (string) Str::uuid(), 'media' => 'anime', 'title' => 'Work '.$number,
                'aliases' => ['anime:'.$number], 'universe_reference' => 'test-universe'];
        }
        $records[] = ['type' => 'end', 'records' => 2];
        file_put_contents($this->path, implode("\n", array_map(fn ($record) => json_encode($record, JSON_THROW_ON_ERROR), $records))."\n");
    }

    protected function tearDown(): void
    {
        @unlink($this->path);
        @unlink($this->path.'.checkpoint');
        parent::tearDown();
    }

    private function runImport(): array
    {
        return app(CatalogIdentityImportRun::class)->run($this->path, $this->path.'.checkpoint', fn () => null);
    }

    public function test_restored_database_checkpoint_overrules_newer_external_mirror(): void
    {
        $complete = $this->runImport();
        $ids = DB::table('catalog_works')->orderBy('id')->pluck('id')->all();
        // Restore the SQL state before its first batch, leaving the mirror ahead.
        foreach (['catalog_universe_works', 'catalog_works', 'catalog_universes', 'catalog_entity_aliases', 'catalog_entity_titles', 'catalog_entities'] as $table) {
            DB::table($table)->delete();
        }
        DB::table('catalog_identity_imports')->update(['works' => 0, 'relations' => 0, 'complete' => false]);
        $this->assertSame($complete, $this->runImport());
        $this->assertSame($ids, DB::table('catalog_works')->orderBy('id')->pluck('id')->all());
        file_put_contents($this->path.'.checkpoint', 'invalid mirror');
        $this->assertSame($complete, $this->runImport());
    }

    public function test_legacy_checkpoint_cannot_skip_missing_database_records(): void
    {
        $source = app(CatalogIdentityInput::class)->inspect($this->path);
        file_put_contents($this->path.'.checkpoint', json_encode([...$source, 'works' => 2], JSON_THROW_ON_ERROR));
        try {
            $this->runImport();
            $this->fail('Unmatched legacy checkpoint was accepted');
        } catch (DomainException $error) {
            $this->assertStringContainsString('ahead of database', $error->getMessage());
            $this->assertDatabaseCount('catalog_identity_imports', 0);
            $this->assertDatabaseCount('catalog_works', 0);
        }
    }

    public function test_existing_legacy_prefix_is_verified_and_adopted_without_changing_ids(): void
    {
        $this->runImport();
        $ids = DB::table('catalog_entities')->orderBy('id')->pluck('id')->all();
        DB::table('catalog_identity_imports')->delete();
        $result = $this->runImport();
        $this->assertTrue($result['complete']);
        $this->assertSame($ids, DB::table('catalog_entities')->orderBy('id')->pluck('id')->all());
    }

    public function test_batch_rollback_keeps_identity_and_checkpoint_atomic(): void
    {
        $source = app(CatalogIdentityInput::class)->inspect($this->path);
        $store = app(CatalogImportCheckpoint::class);
        $initial = $store->read($source, $this->path, $this->path.'.checkpoint');
        try {
            DB::transaction(function () use ($store, $initial): void {
                $store->write([...$initial, 'works' => 2]);
                throw new DomainException('Simulated batch failure');
            });
        } catch (DomainException) {
        }
        $this->assertSame(0, $store->read($source, $this->path, $this->path.'.checkpoint')['works']);
    }
}
