<?php

namespace Tests\Feature;

use App\Support\CatalogEpisodeStore;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogSearch;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogContextLookupTest extends TestCase
{
    use RefreshDatabase;

    private function visibility(array $allowed): void
    {
        $this->mock(CatalogSearch::class)->shouldReceive('summaries')->andReturnUsing(function (array $references) use ($allowed): array {
            $resolved = [];
            foreach ($references as $reference) {
                $id = substr($reference, 5);
                if (in_array($id, $allowed, true)) {
                    $resolved[$reference] = ['work_id' => $id, 'summary' => []];
                }
            }

            return ['resolved' => $resolved];
        });
    }

    public function test_episode_and_season_contexts_resolve_by_foreign_keys_after_renumbering(): void
    {
        $id = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Fixture', 'aliases' => ['work:'.$id], 'universe_reference' => $id,
            'episodes' => [['number' => 9, 'tvdb_season' => 2, 'tvdb_episode_id' => 123]]]);
        $this->visibility([$id]);
        $episode = DB::table('catalog_episodes')->value('id');
        $season = DB::table('catalog_seasons')->value('id');
        app(CatalogEpisodeStore::class)->put($id, 49, [], ['tvdb', 'anime:episode:work:'.$id, '123']);
        $this->getJson('/api/catalog/context/episode/'.$episode)->assertOk()
            ->assertJsonPath('entity.id', $episode)->assertJsonPath('work_id', $id)
            ->assertJsonPath('selection.episode_number', 49)->assertJsonPath('selection.season_id', $season);
        $this->getJson('/api/catalog/context/season/'.$season)->assertOk()
            ->assertJsonPath('entity.id', $season)->assertJsonPath('selection.season_number', 2)
            ->assertJsonPath('selection.episode_number', 49);
        $this->getJson('/api/catalog/context/episode/'.$id)->assertNotFound();
        $this->getJson('/api/catalog/context/season/'.Str::uuid())->assertNotFound();
    }

    public function test_an_arc_without_known_episodes_remains_a_real_navigable_entity(): void
    {
        $id = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Fixture', 'aliases' => ['work:'.$id], 'universe_reference' => $id,
            'arcs' => [['arcId' => 'source-arc', 'name' => 'Explicit arc', 'startEp' => 1, 'endEp' => 12, 'source_url' => 'https://example.org/arc']]]);
        $this->visibility([$id]);
        $arc = DB::table('catalog_arcs')->value('id');
        $this->getJson('/api/catalog/context/arc/'.$arc)->assertOk()
            ->assertJsonPath('entity.id', $arc)->assertJsonPath('work_id', $id)
            ->assertJsonPath('selection.arc_reference', 'source-arc')->assertJsonPath('selection.episode_number', null);
        $this->getJson('/api/catalog/graph/work/'.$id)->assertOk()
            ->assertJsonPath('capabilities.arcs', true)->assertJsonPath('capabilities.episodes', false)
            ->assertJsonPath('arcs.0.id', $arc)->assertJsonPath('arcs.0.start_number', 1)->assertJsonPath('arcs.0.end_number', 12)
            ->assertJsonCount(0, 'arcs.0.episode_ids');
        $this->assertDatabaseCount('catalog_episodes', 0);
    }

    public function test_a_requested_work_must_be_a_visible_member_of_the_context(): void
    {
        $first = (string) Str::uuid();
        $second = (string) Str::uuid();
        foreach ([$first, $second] as $id) {
            app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Fixture', 'aliases' => ['work:'.$id], 'universe_reference' => $first]);
        }
        $this->visibility([$first]);
        $universe = DB::table('catalog_universes')->value('id');
        $this->getJson('/api/catalog/context/universe/'.$universe)->assertOk()->assertJsonPath('work_id', $first);
        $this->getJson('/api/catalog/context/universe/'.$universe.'?work_id='.$second)->assertNotFound();
        $this->getJson('/api/catalog/context/work/'.$first.'?work_id='.$second)->assertNotFound();
        $this->getJson('/api/catalog/context/universe/'.$universe.'?work_id=not-an-id')->assertUnprocessable();
    }

    public function test_database_rejects_an_arc_work_outside_its_universe(): void
    {
        $first = (string) Str::uuid();
        $other = (string) Str::uuid();
        $importer = app(CatalogGraphImporter::class);
        $importer->work(['work_id' => $first, 'media' => 'anime', 'title' => 'First', 'aliases' => [], 'universe_reference' => $first,
            'arcs' => [['arcId' => 'source', 'name' => 'Arc', 'startEp' => 1, 'endEp' => 12, 'source_url' => 'https://example.org/arc']]]);
        $importer->work(['work_id' => $other, 'media' => 'anime', 'title' => 'Other', 'aliases' => [], 'universe_reference' => $other]);
        $arc = DB::table('catalog_arcs')->first();
        $this->expectException(QueryException::class);
        DB::table('catalog_arc_works')->insert(['arc_id' => $arc->id, 'universe_id' => $arc->universe_id, 'work_id' => $other]);
    }
}
