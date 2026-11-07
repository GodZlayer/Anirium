<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogUserCompletion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogUserCompletionTest extends TestCase
{
    use RefreshDatabase;

    private function work(array $numbers, array $extra = []): string
    {
        $id = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Completion fixture', 'aliases' => [],
            'universe_reference' => 'shared', 'status' => 'FINISHED', 'episode_count' => 3,
            'episodes' => array_map(fn ($number) => ['number' => $number, 'tvdb_season' => 1], $numbers), ...$extra]);

        return $id;
    }

    private function watched(User $user, string $work): void
    {
        foreach (DB::table('catalog_episodes')->where('work_id', $work)->get() as $episode) {
            DB::table('user_entity_preferences')->insert(['user_id' => $user->id, 'target_type' => 'episode', 'target_id' => $episode->id, 'entity_id' => $episode->id, 'status' => 'completed']);
        }
    }

    public function test_sparse_episodes_cannot_invent_completion_and_new_releases_revoke_it(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 24));
        $user = User::factory()->create();
        $work = $this->work([1, 3]);
        $this->watched($user, $work);
        $counts = app(CatalogUserCompletion::class)->read($user->id)['counts'];
        $this->assertSame(['episodes' => 2, 'seasons' => 0, 'arcs' => 0, 'works' => 0, 'universes' => 0], $counts);
        $episode = app(CatalogEpisodeStore::class)->put($work, 2);
        DB::table('user_entity_preferences')->insert(['user_id' => $user->id, 'target_type' => 'episode', 'target_id' => $episode, 'entity_id' => $episode, 'status' => 'completed']);
        $result = app(CatalogUserCompletion::class)->read($user->id);
        $this->assertSame(1, $result['counts']['works']);
        $this->assertSame(1, $result['counts']['universes']);
        $this->assertNotContains($work, $result['completed_universe_ids']);
        $this->assertSame(0, app(CatalogUserCompletion::class)->read(User::factory()->create()->id)['counts']['episodes']);
        DB::table('catalog_episodes')->where('work_id', $work)->update(['air_date_utc' => now()->subDay()->toISOString()]);
        DB::table('catalog_works')->where('id', $work)->update(['status' => 'RELEASING', 'episode_count' => 4]);
        $four = app(CatalogEpisodeStore::class)->put($work, 4);
        DB::table('catalog_episodes')->where('id', $four)->update(['air_date_utc' => now()->addDay()->toISOString()]);
        $this->assertSame(1, app(CatalogUserCompletion::class)->read($user->id)['counts']['works']);
        DB::table('catalog_episodes')->where('id', $four)->update(['air_date_utc' => now()->subDay()->toISOString()]);
        $this->assertSame(0, app(CatalogUserCompletion::class)->read($user->id)['counts']['works']);
    }

    public function test_arcs_are_distinct_entities_and_do_not_fabricate_seasons(): void
    {
        $user = User::factory()->create();
        $work = $this->work([1], ['episode_count' => 1, 'episodes' => [['number' => 1]],
            'arcs' => [['arcId' => 'source-arc', 'name' => 'Published', 'startEp' => 1, 'endEp' => 1, 'source_url' => 'https://example.org/arcs']]]);
        $this->watched($user, $work);
        $result = app(CatalogUserCompletion::class)->read($user->id);
        $this->assertSame(1, $result['counts']['arcs']);
        $this->assertSame(0, $result['counts']['seasons']);
        $other = $this->work([1], ['episode_count' => 1]);
        $this->assertSame(0, app(CatalogUserCompletion::class)->read($user->id)['counts']['universes']);
        $this->watched($user, $other);
        $this->assertSame(1, app(CatalogUserCompletion::class)->read($user->id)['counts']['universes']);
    }
}
