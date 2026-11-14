<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogGraphApiTest extends TestCase
{
    use RefreshDatabase;

    private function visible(array $ids): void
    {
        $this->mock(CatalogSearch::class)->shouldReceive('summaries')->andReturnUsing(function (array $references, bool $adult) use ($ids): array {
            $resolved = [];
            foreach ($references as $reference) {
                $id = substr($reference, 5);
                if (isset($ids[$id]) && ($adult || ! $ids[$id])) {
                    $resolved[$reference] = ['work_id' => $id, 'summary' => ['title' => 'Visible fixture', 'universe_v2_id' => $id, 'universe_identity_version' => 0]];
                }
            }

            return ['generation' => 'fixture', 'resolved' => $resolved];
        });
    }

    private function work(string $id, string $universe, array $episodes = []): void
    {
        app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Fixture', 'episode_count' => 12,
            'aliases' => ['work:'.$id], 'universe_reference' => $universe, 'episodes' => $episodes]);
    }

    public function test_graph_returns_persistent_episode_ids_and_explicit_membership_after_renumbering(): void
    {
        $id = (string) Str::uuid();
        $this->work($id, $id, [['number' => 1, 'tvdb_season' => 2, 'tvdb_episode_id' => 123], ['number' => 3, 'tvdb_season' => 2]]);
        $this->visible([$id => false]);
        $episodeId = DB::table('catalog_episodes')->where('number', 1)->value('id');
        $response = $this->getJson('/api/catalog/graph/work/'.$id)->assertOk()
            ->assertJsonPath('entity.id', $id)->assertJsonPath('entity.kind', 'work')
            ->assertJsonCount(2, 'episodes')->assertJsonCount(1, 'seasons')->assertJsonPath('episodes.0.id', $episodeId);
        $universe = $response->json('universe_ids.0');
        $this->assertNotSame($id, $universe);
        app(CatalogEpisodeStore::class)->put($id, 49, [], ['tvdb', 'anime:episode:work:'.$id, '123']);
        $this->getJson('/api/catalog/graph/work/'.$id)->assertOk()
            ->assertJsonPath('episodes.1.id', $episodeId)->assertJsonPath('episodes.1.number', 49);
        $this->getJson('/api/catalog/graph/work/'.$universe)->assertNotFound();
    }

    public function test_hidden_members_and_relations_are_filtered_without_creating_missing_episodes(): void
    {
        $first = (string) Str::uuid();
        $hidden = (string) Str::uuid();
        $this->work($first, $first);
        $this->work($hidden, $first);
        app(CatalogGraphImporter::class)->relations(['work_id' => $first, 'relations' => [['target_work_id' => $hidden, 'relation_type' => 'other', 'source' => 'mal']]]);
        $this->visible([$first => false, $hidden => true]);
        $this->getJson('/api/catalog/graph/work/'.$first)->assertOk()
            ->assertJsonCount(0, 'episodes')->assertJsonCount(0, 'relations')
            ->assertJsonPath('entity.episode_count', 12)->assertJsonPath('capabilities.episodes', false);
        $this->getJson('/api/catalog/graph/work/'.$hidden)->assertNotFound();
        $universe = DB::table('catalog_universes')->value('id');
        $this->getJson('/api/catalog/graph/universe/'.$universe)->assertOk()->assertJsonPath('work_ids', [$first])
            ->assertJsonPath('works.0.work_id', $first)->assertJsonPath('works.0.universe_identity_version', 1)
            ->assertJsonPath('works.0.universe_v2_id', $universe)->assertJsonPath('works.0.universe_ids_json', json_encode([$universe]));
        $this->actingAs(User::factory()->create(['adult_content_enabled' => true]));
        $this->getJson('/api/catalog/graph/work/'.$first)->assertOk()
            ->assertJsonPath('relations.0.to_work_id', $hidden)->assertJsonPath('relations.0.relation_type', 'other');
        $this->getJson('/api/catalog/graph/universe/'.$universe)->assertOk()->assertJsonCount(2, 'work_ids');
    }

    public function test_virtual_episode_endpoint_renders_episode_context_for_works_without_episode_rows(): void
    {
        $workId = (string) Str::uuid();
        $this->work($workId, $workId);
        $this->visible([$workId => false]);

        $this->get('/api/catalog/graph/episode/'.$workId.':ep:1?render=blade&adult=0&v=v8')
            ->assertOk()
            ->assertSee('UNIDADE #01')
            ->assertSee('Raio-X do Episódio')
            ->assertSee("window.pushNavigation('episode', '".$workId.":ep:1'", false);
    }
}
