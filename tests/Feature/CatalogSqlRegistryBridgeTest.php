<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class CatalogSqlRegistryBridgeTest extends TestCase
{
    use RefreshDatabase;

    public function test_node_and_laravel_share_real_schema_identities_without_touching_accounts(): void
    {
        $id = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Original',
            'aliases' => ['work:'.$id], 'references' => [['provider' => 'kitsu', 'media' => 'anime', 'id' => '1']], 'universe_reference' => 'fixture',
            'episodes' => [['number' => 1, 'tvdb_season' => 1, 'tvdb_episode_id' => 991, 'titles' => ['en' => 'Original first']]]]);
        $user = User::factory()->create(['tier' => 3]);
        $episode = DB::table('catalog_episodes')->value('id');
        DB::table('user_entity_preferences')->insert(['user_id' => $user->id, 'target_type' => 'episode', 'target_id' => $episode, 'entity_id' => $episode, 'created_at' => now(), 'updated_at' => now()]);
        File::ensureDirectoryExists(storage_path('framework/testing'));
        $database = storage_path('framework/testing/registry-'.Str::uuid().'.sqlite');
        $mirror = $database.'.json';
        $pdo = new PDO('sqlite:'.$database);
        foreach (DB::select("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid") as $table) {
            $pdo->exec($table->sql);
        }
        foreach (DB::select("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY rowid") as $index) {
            $pdo->exec($index->sql);
        }
        foreach (['users', 'catalog_entities', 'catalog_works', 'catalog_universes', 'catalog_universe_works', 'catalog_entity_aliases', 'catalog_external_identities', 'catalog_seasons', 'catalog_episodes', 'catalog_entity_titles', 'user_entity_preferences'] as $table) {
            foreach (DB::table($table)->get() as $row) {
                $data = (array) $row;
                $columns = implode(',', array_map(fn ($name) => '"'.$name.'"', array_keys($data)));
                $pdo->prepare('INSERT INTO '.$table.' ('.$columns.') VALUES ('.implode(',', array_fill(0, count($data), '?')).')')->execute(array_values($data));
            }
        }
        $script = <<<'JS'
import {loadRegistry,saveRegistry} from './scripts/catalog/registry-store.mjs';
import {assignIdentity} from './scripts/catalog/assign-identities.mjs';
import {syncSqlWorkGraph} from './scripts/catalog/sql-work-graph.mjs';
import {syncSqlChildren} from './scripts/catalog/sql-children-sync.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const [database,file]=process.argv.slice(1), loaded=loadRegistry(file,{database});
const work=assignIdentity({title:'Enriched',mal_id:11757,external_ids_json:'[{"provider":"kitsu","media":"anime","id":"1"}]'},loaded.registry);
saveRegistry(file,loaded.registry,loaded);
syncSqlWorkGraph([work],loaded.registry,{database});
const directory=database+'.data', content=JSON.stringify({mal_id:11757,catalog_key:'anime:11757',source:'anizip',source_url:'https://api.ani.zip/mappings?mal_id=11757',checked_at:'2026-10-24T00:00:00Z',episodes:[{number:1,titles:{en:'First'},tvdb_season:1,tvdb_episode_id:991}]});
const hash=createHash('sha256').update(content).digest('hex');
mkdirSync(path.join(directory,'episodes/anime/11757'),{recursive:true});
writeFileSync(path.join(directory,'episodes/anime/11757',hash+'.json'),content);
work.episodes_metadata_url='/data/episodes/anime/11757/'+hash+'.json';
syncSqlChildren([work],directory,{database});
syncSqlChildren([work],directory,{database});
console.log(work.work_id);
JS;
        try {
            $result = Process::path(base_path())->timeout(60)->run(['node', '--input-type=module', '-e', $script, $database, $mirror]);
            $this->assertTrue($result->successful(), $result->errorOutput());
            $this->assertSame($id, trim($result->output()));
            $this->assertSame($id, $pdo->query("SELECT entity_id FROM catalog_external_identities WHERE provider='mal' AND namespace='anime:work' AND external_id='11757'")->fetchColumn());
            $this->assertSame(1, (int) $pdo->query('SELECT count(*) FROM users')->fetchColumn());
            $this->assertSame($user->email, $pdo->query('SELECT email FROM users')->fetchColumn());
            $this->assertSame(3, (int) $pdo->query('SELECT tier FROM users')->fetchColumn());
            $this->assertSame(1, (int) $pdo->query('SELECT count(*) FROM catalog_episodes')->fetchColumn());
            $this->assertSame(1, (int) $pdo->query('SELECT count(*) FROM catalog_seasons')->fetchColumn());
            $this->assertSame($id, $pdo->query('SELECT work_id FROM catalog_episodes')->fetchColumn());
            $this->assertSame($episode, $pdo->query('SELECT id FROM catalog_episodes')->fetchColumn());
            $this->assertSame($episode, $pdo->query('SELECT entity_id FROM user_entity_preferences')->fetchColumn());
            $this->assertSame($episode, $pdo->query('SELECT target_id FROM user_entity_preferences')->fetchColumn());
            $this->assertSame(DB::table('catalog_universe_works')->where('work_id', $id)->value('universe_id'), $pdo->query('SELECT universe_id FROM catalog_universe_works')->fetchColumn());
            $this->assertSame([], $pdo->query('PRAGMA foreign_key_check')->fetchAll());
        } finally {
            $pdo = null;
            File::deleteDirectory($database.'.data');
            foreach ([$mirror, $database, $database.'-wal', $database.'-shm'] as $file) {
                @unlink($file);
            }
        }
    }
}
