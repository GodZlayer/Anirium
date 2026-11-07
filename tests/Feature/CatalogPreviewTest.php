<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class CatalogPreviewTest extends TestCase
{
    private string $root;

    private string $name;

    private string $generation;

    private string $work;

    protected function setUp(): void
    {
        parent::setUp();
        $this->name = 'preview-fixture-'.Str::uuid();
        $this->root = storage_path('app/catalog/'.$this->name);
        $this->generation = (string) Str::uuid();
        $this->work = (string) Str::uuid();
        File::ensureDirectoryExists($this->root.'/data/catalog/v2/'.$this->generation);
        File::ensureDirectoryExists($this->root.'/indexes');
        File::put($this->root.'/data/catalog.manifest.json', json_encode(['schema' => 2, 'generation' => $this->generation, 'search' => ['schema' => 2, 'generation' => $this->generation]]));
        File::put($this->root.'/data/catalog/v2/'.$this->generation.'/lookup.json', '{}');
        $db = new PDO('sqlite:'.$this->root.'/indexes/'.$this->generation.'.sqlite');
        $db->exec('CREATE TABLE works(work_id TEXT PRIMARY KEY, partition_url TEXT, adult INTEGER); CREATE TABLE aliases(reference TEXT PRIMARY KEY, work_id TEXT)');
        $db->prepare('INSERT INTO works VALUES(?,?,0)')->execute([$this->work, '/data/catalog/v2/'.$this->generation.'/anime-00000.parquet']);
        $db->prepare('INSERT INTO aliases VALUES(?,?)')->execute(['anime:1', $this->work]);
    }

    protected function tearDown(): void
    {
        $this->assertSame(realpath(storage_path('app/catalog')), dirname(realpath($this->root)));
        File::deleteDirectory($this->root);
        parent::tearDown();
    }

    public function test_named_candidate_uses_only_its_own_manifest_index_and_files_in_local_environment(): void
    {
        $this->app->instance('env', 'local');
        $query = '?candidate='.$this->name;
        $this->getJson('/api/catalog/candidate/manifest'.$query)->assertOk();
        $this->getJson('/api/catalog/candidate/work/1'.$query)->assertOk()->assertJsonPath('work_id', $this->work);
        $this->get('/api/catalog/candidate/files/'.$this->generation.'/lookup.json'.$query)->assertOk();
        foreach (['../published', '/tmp', 'missing-folder', ''] as $name) {
            $this->getJson('/api/catalog/candidate/manifest?candidate='.urlencode($name))->assertNotFound();
        }
        $this->getJson('/api/catalog/candidate/manifest?candidate%5B%5D='.$this->name)->assertNotFound();
    }

    public function test_named_candidates_are_not_exposed_outside_local_environment(): void
    {
        $this->getJson('/api/catalog/candidate/manifest?candidate='.$this->name)->assertNotFound();
        $this->getJson('/api/catalog/candidate/work/1?candidate='.$this->name)->assertNotFound();
    }
}
