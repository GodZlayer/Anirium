<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeReferenceRepair;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogExternalIdentityStore;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogImportedArcRepair;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogImportedLinkRepairTest extends TestCase
{
    use RefreshDatabase;

    private function work(): string
    {
        $id = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Work', 'aliases' => ['work:'.$id], 'universe_reference' => $id]);

        return $id;
    }

    public function test_sparse_arc_links_are_repaired_without_allocating_ids_or_missing_episodes(): void
    {
        $id = (string) Str::uuid();
        $record = ['work_id' => $id, 'media' => 'anime', 'title' => 'Sparse work', 'aliases' => ['work:'.$id], 'universe_reference' => $id,
            'episodes' => [['number' => 1], ['number' => 3]],
            'arcs' => [['arcId' => 'documented', 'name' => 'Arc', 'startEp' => 1, 'endEp' => 3, 'source_url' => 'https://example.org/arc']]];
        app(CatalogGraphImporter::class)->work($record);
        $entities = DB::table('catalog_entities')->orderBy('id')->pluck('id')->all();
        $arc = DB::table('catalog_arcs')->value('id');
        DB::table('catalog_arc_episodes')->delete();
        DB::table('catalog_arc_works')->delete();
        $repair = app(CatalogImportedArcRepair::class);
        $repair->record($record);
        $repair->record($record);
        $this->assertSame($entities, DB::table('catalog_entities')->orderBy('id')->pluck('id')->all());
        $this->assertDatabaseCount('catalog_episodes', 2);
        $this->assertDatabaseCount('catalog_arc_episodes', 2);
        $this->assertDatabaseHas('catalog_arc_works', ['arc_id' => $arc, 'work_id' => $id, 'start_number' => 1, 'end_number' => 3]);
    }

    public function test_global_tvdb_reference_becomes_work_scoped_without_merging_releases_or_losing_progress(): void
    {
        $first = $this->work();
        $second = $this->work();
        $store = app(CatalogEpisodeStore::class);
        $original = $store->put($first, 1, [], ['tvdb', 'anime:episode', '82962']);
        $other = $store->put($second, 1, [], ['tvdb', 'anime:episode:work:'.$second, '82962']);
        $user = User::factory()->create();
        DB::table('user_entity_preferences')->insert(['user_id' => $user->id, 'entity_id' => $original, 'target_type' => 'episode', 'target_id' => $original, 'progress_seconds' => 87]);
        $repair = app(CatalogEpisodeReferenceRepair::class);
        $this->assertSame(['scoped_episode_references' => 1], $repair->run());
        $this->assertSame(['scoped_episode_references' => 0], $repair->run());
        $external = app(CatalogExternalIdentityStore::class);
        $this->assertSame($original, $external->find('tvdb', 'anime:episode:work:'.$first, '82962'));
        $this->assertSame($other, $external->find('tvdb', 'anime:episode:work:'.$second, '82962'));
        $this->assertNull($external->find('tvdb', 'anime:episode', '82962'));
        $this->assertDatabaseHas('user_entity_preferences', ['entity_id' => $original, 'progress_seconds' => 87]);
        $this->assertDatabaseCount('catalog_episodes', 2);
    }

    public function test_conflicting_episode_reference_cannot_be_reassigned(): void
    {
        $work = $this->work();
        $store = app(CatalogEpisodeStore::class);
        $first = $store->put($work, 1, [], ['tvdb', 'anime:episode', '123']);
        $second = $store->put($work, 2, [], ['tvdb', 'anime:episode:work:'.$work, '123']);
        try {
            app(CatalogEpisodeReferenceRepair::class)->run();
            $this->fail('Conflicting reference was moved');
        } catch (DomainException) {
            $external = app(CatalogExternalIdentityStore::class);
            $this->assertSame($first, $external->find('tvdb', 'anime:episode', '123'));
            $this->assertSame($second, $external->find('tvdb', 'anime:episode:work:'.$work, '123'));
        }
    }
}
