<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogExternalIdentityStore;
use App\Support\CatalogIdentityStore;
use DomainException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogIdentityGraphTest extends TestCase
{
    use RefreshDatabase;

    private function work(string $media = 'anime'): string
    {
        $id = app(CatalogIdentityStore::class)->create('work');
        DB::table('catalog_works')->insert(['id' => $id, 'media' => $media, 'title' => 'Identity fixture']);

        return $id;
    }

    public function test_work_uuid_is_preserved_and_universe_gets_its_own_identity(): void
    {
        $store = app(CatalogIdentityStore::class);
        $work = (string) Str::uuid();
        $this->assertSame($work, $store->create('work', ['anime:21'], $work));
        $universe = $store->create('universe', [$work]);
        $this->assertNotSame($work, $universe);
        $this->assertSame($universe, $store->create('universe', [$work]));
        $this->assertSame($universe, $store->resolveLegacy('universe', $work));
        $this->assertNull($store->resolve('universe', $work));
        $this->expectException(DomainException::class);
        $store->create('episode', [], $work);
    }

    public function test_external_ids_are_namespaced_and_cannot_reassign_an_existing_identity(): void
    {
        $external = app(CatalogExternalIdentityStore::class);
        $anime = $this->work();
        $manga = $this->work('manga');
        $external->attach($anime, 'mal', 'anime:work', '21');
        $external->attach($manga, 'mal', 'manga:work', '21');
        $this->assertSame($anime, $external->find('mal', 'anime:work', '21'));
        $this->assertSame($manga, $external->find('mal', 'manga:work', '21'));
        $this->expectException(DomainException::class);
        $external->attach($manga, 'mal', 'anime:work', '21');
    }

    public function test_renumbering_by_provider_identity_keeps_the_episode_and_user_progress(): void
    {
        $work = $this->work();
        $episodes = app(CatalogEpisodeStore::class);
        $identity = ['tvdb', 'anime:episode', '987654'];
        $id = $episodes->put($work, 9, ['legacy:ep-9'], $identity);
        $user = User::factory()->create();
        DB::table('user_entity_preferences')->insert(['user_id' => $user->id, 'entity_id' => $id, 'target_type' => 'episode', 'target_id' => $id, 'progress_seconds' => 87]);
        $this->assertSame($id, $episodes->put($work, 49, ['legacy:ep-49'], $identity));
        $this->assertDatabaseCount('catalog_episodes', 1);
        $this->assertDatabaseHas('user_entity_preferences', ['entity_id' => $id, 'progress_seconds' => 87]);
        $this->assertSame($id, app(CatalogIdentityStore::class)->resolveLegacy('episode', 'legacy:ep-9'));
    }

    public function test_long_provider_slugs_preserve_their_full_identity(): void
    {
        $store = app(CatalogExternalIdentityStore::class);
        $work = $this->work('manga');
        $slug = str_repeat('a', 262).'z';
        $store->attach($work, 'anime-planet', 'manga:work', $slug);
        $this->assertSame($work, $store->find('anime-planet', 'manga:work', $slug));
        $this->assertNull($store->find('anime-planet', 'manga:work', substr($slug, 0, 160)));
        $this->expectException(DomainException::class);
        $store->attach($work, 'anime-planet', 'manga:work', str_repeat('a', 513));
    }

    public function test_database_rejects_a_season_from_a_different_work(): void
    {
        $first = $this->work();
        $other = $this->work();
        $season = app(CatalogIdentityStore::class)->create('season');
        DB::table('catalog_seasons')->insert(['id' => $season, 'work_id' => $first, 'number' => 1]);
        $this->expectException(QueryException::class);
        app(CatalogEpisodeStore::class)->put($other, 1, [], null, $season);
    }

    public function test_database_rejects_an_arc_link_outside_its_universe(): void
    {
        $store = app(CatalogIdentityStore::class);
        $work = $this->work();
        $episode = app(CatalogEpisodeStore::class)->put($work, 1);
        $universe = $store->create('universe');
        DB::table('catalog_universes')->insert(['id' => $universe]);
        $arc = $store->create('arc');
        DB::table('catalog_arcs')->insert(['id' => $arc, 'universe_id' => $universe, 'title' => 'Documented arc']);
        $this->expectException(QueryException::class);
        DB::table('catalog_arc_episodes')->insert(['arc_id' => $arc, 'episode_id' => $episode, 'universe_id' => $universe, 'work_id' => $work]);
    }

    public function test_a_user_target_cannot_be_deleted_and_alias_conflicts_are_atomic(): void
    {
        $store = app(CatalogIdentityStore::class);
        $id = $this->work();
        $other = $this->work();
        $store->alias('work', 'anime:1', $id);
        $store->alias('work', 'anime:2', $other);
        try {
            $store->create('work', ['anime:1', 'anime:2', 'new-alias']);
            $this->fail('Conflicting identities were accepted');
        } catch (DomainException) {
            $this->assertNull($store->resolveLegacy('work', 'new-alias'));
        }
        $user = User::factory()->create();
        $episode = $store->create('episode', [], null, 'unresolved');
        DB::table('entity_discussions')->insert(['user_id' => $user->id, 'entity_id' => $episode, 'target_type' => 'episode', 'target_id' => $episode, 'comment_body' => 'Preserve this comment']);
        $this->expectException(QueryException::class);
        DB::table('catalog_entities')->where('id', $episode)->delete();
    }
}
