<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogActivationSource;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogIdentityActivation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class CatalogIdentityActivationTest extends TestCase
{
    use RefreshDatabase;

    private string $directory;

    private string $source;

    private string $target;

    private string $originalConnection;

    private string $work;

    protected function setUp(): void
    {
        parent::setUp();
        $this->originalConnection = DB::getDefaultConnection();
        $this->directory = storage_path('framework/testing/activation-'.Str::uuid());
        File::ensureDirectoryExists($this->directory);
        $this->app->useStoragePath($this->directory);
        $this->source = $this->directory.'/source.sqlite';
        $this->target = $this->directory.'/target.sqlite';
        $this->work = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $this->work, 'media' => 'anime', 'title' => 'Activation fixture', 'aliases' => ['work:'.$this->work], 'references' => [], 'universe_reference' => 'activation', 'episodes' => [['number' => 1]]]);
        $generation = (string) Str::uuid();
        DB::table('catalog_identity_imports')->insert(['sha256' => str_repeat('a', 64), 'generation' => $generation, 'records' => 1, 'works' => 1, 'relations' => 1, 'pending_relations' => 0, 'complete' => true]);
        DB::table('catalog_registry_adoptions')->insert(['generation' => $generation, 'registry_sha256' => str_repeat('b', 64), 'works' => 1, 'redirects' => 0, 'created_at' => now()]);
        User::factory()->create(['email' => 'candidate@example.test', 'tier' => 1]);
        foreach ([$this->source, $this->target] as $file) {
            $pdo = new PDO('sqlite:'.$file);
            foreach (DB::select("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid") as $table) {
                $pdo->exec($table->sql);
            }
            foreach (DB::select("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL") as $index) {
                $pdo->exec($index->sql);
            }
            $tables = $file === $this->source ? [...CatalogActivationSource::TABLES, 'users'] : ['users'];
            foreach ($tables as $table) {
                foreach (DB::table($table)->get() as $record) {
                    $data = (array) $record;
                    if ($file === $this->target && $table === 'users') {
                        $data['email'] = 'admin@example.test';
                        $data['tier'] = 3;
                    }
                    $columns = implode(',', array_map(fn ($column) => '"'.$column.'"', array_keys($data)));
                    $pdo->prepare('INSERT INTO '.$table.' ('.$columns.') VALUES ('.implode(',', array_fill(0, count($data), '?')).')')->execute(array_values($data));
                }
            }
        }
        config(['database.connections.activation' => ['driver' => 'sqlite', 'database' => $this->target, 'foreign_key_constraints' => true]]);
        DB::setDefaultConnection('activation');
        DB::table('user_entity_preferences')->insert(['user_id' => 1, 'target_type' => 'work', 'target_id' => 'legacy-work', 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function tearDown(): void
    {
        DB::purge('activation');
        DB::setDefaultConnection($this->originalConnection);
        File::deleteDirectory($this->directory);
        parent::tearDown();
    }

    public function test_activation_copies_only_catalog_and_keeps_a_verified_backup(): void
    {
        $result = app(CatalogIdentityActivation::class)->run($this->source);
        $this->assertSame(1, $result['works']);
        $this->assertSame($this->work, DB::table('catalog_works')->value('id'));
        $this->assertSame(1, DB::table('catalog_episodes')->count());
        $this->assertSame('admin@example.test', DB::table('users')->value('email'));
        $this->assertSame(3, DB::table('users')->value('tier'));
        $this->assertSame('legacy-work', DB::table('user_entity_preferences')->value('target_id'));
        $backup = new PDO('sqlite:'.$result['backup']);
        $this->assertSame('ok', $backup->query('PRAGMA integrity_check')->fetchColumn());
        $this->assertSame(0, (int) $backup->query('SELECT count(*) FROM catalog_entities')->fetchColumn());
        $this->assertSame('admin@example.test', $backup->query('SELECT email FROM users')->fetchColumn());
        $this->assertSame([], DB::select('PRAGMA foreign_key_check'));
    }

    public function test_incomplete_import_is_rejected_without_copying_anything(): void
    {
        (new PDO('sqlite:'.$this->source))->exec('UPDATE catalog_identity_imports SET complete=0');
        try {
            app(CatalogIdentityActivation::class)->run($this->source);
            $this->fail('Incomplete source accepted');
        } catch (\DomainException $exception) {
            $this->assertStringContainsString('completed import', $exception->getMessage());
        }
        $this->assertSame(0, DB::table('catalog_entities')->count());
    }

    public function test_a_mid_copy_failure_rolls_back_all_catalog_tables_and_preserves_accounts(): void
    {
        DB::unprepared("CREATE TRIGGER reject_episode BEFORE INSERT ON catalog_episodes BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
        try {
            app(CatalogIdentityActivation::class)->run($this->source);
            $this->fail('Expected copy failure');
        } catch (\PDOException $exception) {
            $this->assertStringContainsString('fixture failure', $exception->getMessage());
        }
        $this->assertSame(0, DB::table('catalog_entities')->count());
        $this->assertSame(0, DB::table('catalog_works')->count());
        $this->assertSame('admin@example.test', DB::table('users')->value('email'));
    }

    public function test_existing_identity_graph_cannot_be_replaced(): void
    {
        app(CatalogIdentityActivation::class)->run($this->source);
        $this->expectExceptionMessage('empty identity graph');
        app(CatalogIdentityActivation::class)->run($this->source);
    }

    public function test_forged_entity_role_is_rejected_before_activation(): void
    {
        (new PDO('sqlite:'.$this->source))->exec("UPDATE catalog_entities SET kind='episode' WHERE kind='work'");
        try {
            app(CatalogIdentityActivation::class)->run($this->source);
            $this->fail('Wrong entity role accepted');
        } catch (\DomainException $exception) {
            $this->assertStringContainsString('role mismatch', $exception->getMessage());
        }
        $this->assertSame(0, DB::table('catalog_entities')->count());
    }

    public function test_an_orphan_identity_cannot_enter_the_canonical_graph(): void
    {
        $source = new PDO('sqlite:'.$this->source);
        $source->prepare("INSERT INTO catalog_entities(id,kind,resolution_status) VALUES(?,'work','verified')")->execute([(string) Str::uuid()]);
        try {
            app(CatalogIdentityActivation::class)->run($this->source);
            $this->fail('Untyped entity accepted');
        } catch (\DomainException $exception) {
            $this->assertStringContainsString('without a typed record', $exception->getMessage());
        }
        $this->assertSame(0, DB::table('catalog_entities')->count());
    }
}
