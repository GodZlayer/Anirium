<?php

namespace Tests\Feature;

use App\Support\CatalogIdentityImportRun;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class CatalogIdentityImportRunTest extends TestCase
{
    use RefreshDatabase;

    public function test_restart_reuses_committed_ids_and_finishes_relations(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'catalog-input-');
        $checkpoint = $path.'.checkpoint';
        $universe = (string) Str::uuid();
        $ids = array_map(fn () => (string) Str::uuid(), range(1, 251));
        $lines = [['type' => 'manifest', 'schema' => 1, 'generation' => (string) Str::uuid()]];
        foreach ($ids as $index => $id) {
            $lines[] = ['type' => 'work', 'work_id' => $id, 'media' => 'anime', 'title' => 'Work '.$index, 'aliases' => ['anime:'.($index + 1)], 'universe_reference' => $universe,
                'relations' => $index === 0 ? [['target_work_id' => $ids[250], 'relation_type' => 'sequel', 'source' => 'mal']] : []];
        }
        $lines[] = ['type' => 'end', 'records' => count($ids)];
        file_put_contents($path, implode("\n", array_map(fn (array $line) => json_encode($line, JSON_THROW_ON_ERROR), $lines))."\n");
        try {
            $run = app(CatalogIdentityImportRun::class);
            try {
                $run->run($path, $checkpoint, function (): void {
                    throw new RuntimeException('Simulated process interruption');
                });
                $this->fail('Interruption did not occur');
            } catch (RuntimeException $exception) {
                $this->assertSame('Simulated process interruption', $exception->getMessage());
            }
            $this->assertDatabaseCount('catalog_works', 250);
            $universeId = DB::table('catalog_universes')->value('id');
            $state = $run->run($path, $checkpoint, fn () => null);
            $this->assertTrue($state['complete']);
            $this->assertSame($universeId, DB::table('catalog_universes')->value('id'));
            $this->assertDatabaseCount('catalog_works', 251);
            $this->assertDatabaseCount('catalog_universes', 1);
            $this->assertDatabaseHas('catalog_work_relations', ['from_work_id' => $ids[0], 'to_work_id' => $ids[250]]);
            $this->assertSame($state, $run->run($path, $checkpoint, fn () => null));
        } finally {
            @unlink($path);
            @unlink($checkpoint);
        }
    }

    public function test_incomplete_input_is_rejected_before_any_database_write(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'catalog-input-');
        file_put_contents($path, json_encode(['type' => 'manifest', 'schema' => 1, 'generation' => (string) Str::uuid()], JSON_THROW_ON_ERROR)."\n");
        try {
            app(CatalogIdentityImportRun::class)->run($path, $path.'.checkpoint', fn () => null);
            $this->fail('Truncated input was accepted');
        } catch (DomainException $exception) {
            $this->assertSame('Incomplete identity input', $exception->getMessage());
            $this->assertDatabaseCount('catalog_entities', 0);
        } finally {
            @unlink($path);
        }
    }
}
