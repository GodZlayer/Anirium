<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CanonicalEntityActionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_progress_and_comments_follow_the_episode_uuid_after_renumbering(): void
    {
        $work = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $work, 'media' => 'anime', 'title' => 'Fixture', 'aliases' => ['work:'.$work], 'universe_reference' => $work,
            'episodes' => [['number' => 9, 'tvdb_episode_id' => 987]]]);
        $episode = DB::table('catalog_episodes')->value('id');
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/entity/preference', ['target_type' => 'episode', 'target_id' => $episode, 'progress_seconds' => 87])
            ->assertOk()->assertJsonPath('preference.entity_id', $episode);
        $this->postJson('/api/entity/comments', ['target_type' => 'episode', 'target_id' => $episode, 'comment_body' => 'Keep this discussion'])
            ->assertCreated()->assertJsonPath('comment.entity_id', $episode);
        app(CatalogEpisodeStore::class)->put($work, 49, [], ['tvdb', 'anime:episode:work:'.$work, '987']);
        $this->getJson('/api/entity/preferences?target_type=episode&target_id='.$episode)->assertOk()
            ->assertJsonPath('preferences.0.progress_seconds', 87)->assertJsonPath('preferences.0.entity_id', $episode)
            ->assertJsonPath('preferences.0.work_id', $work)->assertJsonPath('preferences.0.episode_number', 49);
        $this->getJson('/api/entity/comments/episode/'.$episode)->assertOk()->assertJsonPath('comments.0.comment_body', 'Keep this discussion');
        $this->assertDatabaseCount('user_entity_preferences', 1);
        $this->assertDatabaseCount('entity_discussions', 1);
        $this->postJson('/api/entity/preference', ['target_type' => 'episode', 'target_id' => $work, 'bookmarked' => true])->assertStatus(422);
        $this->postJson('/api/entity/comments', ['target_type' => 'episode', 'target_id' => (string) Str::uuid(), 'comment_body' => 'Unknown'])->assertStatus(422);
        $this->postJson('/api/telemetry/events', ['machine_fingerprint' => 'canonical-test', 'events' => [['target_type' => 'episode', 'target_id' => $episode, 'event_type' => 'playback_heartbeat']]])->assertOk();
        $this->assertDatabaseHas('user_interaction_events', ['entity_id' => $episode, 'target_id' => $episode]);
    }

    public function test_canonical_lookup_updates_a_linked_legacy_action_without_crossing_users(): void
    {
        $work = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $work, 'media' => 'anime', 'title' => 'Fixture', 'aliases' => ['anime:21'], 'universe_reference' => $work]);
        $universe = DB::table('catalog_universes')->value('id');
        $first = User::factory()->create();
        $other = User::factory()->create();
        foreach ([$first, $other] as $user) {
            DB::table('user_entity_preferences')->insert(['user_id' => $user->id, 'target_type' => 'universe', 'target_id' => 'universe:21', 'entity_id' => $universe, 'user_score' => 8]);
        }
        $this->actingAs($first)->postJson('/api/entity/preference', ['target_type' => 'universe', 'target_id' => $universe, 'bookmarked' => true])->assertOk();
        $this->getJson('/api/entity/preferences?target_type=universe&target_id='.$universe)->assertOk()->assertJsonCount(1, 'preferences')->assertJsonPath('preferences.0.user_score', 8);
        $this->assertDatabaseCount('user_entity_preferences', 2);
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $first->id, 'entity_id' => $universe, 'bookmarked' => true]);
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $other->id, 'entity_id' => $universe, 'bookmarked' => false]);
    }
}
