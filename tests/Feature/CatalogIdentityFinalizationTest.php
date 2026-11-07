<?php

namespace Tests\Feature;

use App\Support\CatalogGraphImporter;
use App\Support\CatalogIdentityInput;
use App\Support\CatalogImportCheckpoint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogIdentityFinalizationTest extends TestCase
{
    use RefreshDatabase;

    private string $directory;

    private string $input;

    private string $id;

    private array $entityIds;

    protected function setUp(): void
    {
        parent::setUp();
        $this->directory = storage_path('framework/testing/finalization-'.Str::uuid());
        $this->app->useStoragePath($this->directory);
        $archives = storage_path('app/catalog/published/registries');
        config(['catalog.registry_archives' => $archives]);
        File::ensureDirectoryExists($archives);
        File::ensureDirectoryExists(storage_path('app/catalog/identity-inputs'));
        $generation = (string) Str::uuid();
        $this->id = (string) Str::uuid();
        $record = ['type' => 'work', 'work_id' => $this->id, 'media' => 'anime', 'title' => 'Finalization fixture',
            'aliases' => ['work:'.$this->id], 'universe_reference' => $this->id,
            'references' => [['provider' => 'kitsu', 'media' => 'anime', 'id' => '700']],
            'episodes' => [['number' => 1, 'tvdb_episode_id' => 123]],
            'arcs' => [['arcId' => 'published-arc', 'name' => 'Arc', 'startEp' => 1, 'endEp' => 1, 'source_url' => 'https://example.org/arc']]];
        app(CatalogGraphImporter::class)->work($record);
        $this->entityIds = DB::table('catalog_entities')->orderBy('id')->pluck('id')->all();
        DB::table('catalog_arc_episodes')->delete();
        DB::table('catalog_arc_works')->delete();
        DB::table('catalog_external_identities')->where('provider', 'tvdb')->update(['namespace' => 'anime:episode']);
        $this->input = storage_path('app/catalog/identity-inputs/'.$generation.'.ndjson');
        $lines = [['type' => 'manifest', 'schema' => 1, 'generation' => $generation], $record, ['type' => 'end', 'records' => 1]];
        File::put($this->input, implode("\n", array_map(fn ($line) => json_encode($line, JSON_THROW_ON_ERROR), $lines))."\n");
        $source = app(CatalogIdentityInput::class)->inspect($this->input);
        app(CatalogImportCheckpoint::class)->write([...$source, 'works' => 1, 'relations' => 0, 'pending_relations' => 0, 'complete' => false]);
        File::put($archives.'/'.$generation.'.json', '{}');
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->directory);
        parent::tearDown();
    }

    public function test_import_automatically_repairs_legacy_links_before_registry_adoption(): void
    {
        Process::fake(function () {
            $this->assertTrue((bool) DB::table('catalog_identity_imports')->value('complete'));
            $this->assertDatabaseHas('catalog_arc_works', ['work_id' => $this->id, 'start_number' => 1, 'end_number' => 1]);
            $this->assertDatabaseMissing('catalog_external_identities', ['provider' => 'tvdb', 'namespace' => 'anime:episode']);

            return Process::result(output: '{"works":1,"redirects":0}');
        });
        $this->artisan('catalog:identities', ['action' => 'import', '--input' => $this->input])->assertSuccessful();
        Process::assertRan(fn ($process) => $process->command[2] === base_path('scripts/adopt-catalog-registry.mjs'));
        $this->assertSame($this->entityIds, DB::table('catalog_entities')->orderBy('id')->pluck('id')->all());
    }

    public function test_failed_adoption_does_not_discard_completed_input_and_can_resume(): void
    {
        Process::fake(['*' => Process::result(errorOutput: 'Interrupted metadata adoption', exitCode: 1)]);
        $this->artisan('catalog:identities', ['action' => 'import', '--input' => $this->input])->assertFailed();
        $this->assertTrue((bool) DB::table('catalog_identity_imports')->value('complete'));
        Process::fake(['*' => Process::result(output: '{"works":1,"redirects":0}')]);
        $this->artisan('catalog:identities', ['action' => 'import', '--input' => $this->input])->assertSuccessful();
        $this->assertSame($this->entityIds, DB::table('catalog_entities')->orderBy('id')->pluck('id')->all());
        $this->assertDatabaseCount('catalog_episodes', 1);
    }
}
