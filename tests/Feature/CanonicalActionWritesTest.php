<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogActionBackfill;
use App\Support\CatalogActionTarget;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogIdentityStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CanonicalActionWritesTest extends TestCase
{
    use RefreshDatabase;

    private string $work;

    protected function setUp(): void
    {
        parent::setUp();
        $this->work = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $this->work, 'media' => 'anime', 'title' => 'Fixture',
            'aliases' => ['anime:269', '269', 'work:'.$this->work], 'universe_reference' => 'published-root']);
        $this->actingAs(User::factory()->create());
    }

    public function test_aliases_are_accepted_only_at_entry_and_every_write_stores_the_uuid(): void
    {
        $this->postJson('/api/entity/preference', ['target_type' => 'work', 'target_id' => 'anime:269', 'bookmarked' => true])->assertOk()->assertJsonPath('preference.target_id', $this->work);
        $this->postJson('/api/entity/preference', ['target_type' => 'work', 'target_id' => $this->work, 'user_score' => 8])->assertOk();
        $this->postJson('/api/entity/comments', ['target_type' => 'work', 'target_id' => 'work:269', 'comment_body' => 'Comment'])->assertCreated()->assertJsonPath('comment.target_id', $this->work);
        $this->postJson('/api/telemetry/events', ['events' => [['target_type' => 'work', 'target_id' => '269', 'event_type' => 'view']]])->assertOk();
        $this->assertDatabaseCount('user_entity_preferences', 1);
        foreach (['user_entity_preferences', 'entity_discussions', 'user_interaction_events'] as $table) {
            $this->assertDatabaseHas($table, ['entity_id' => $this->work, 'target_id' => $this->work]);
        }
    }

    public function test_unknown_targets_and_roles_are_rejected_and_an_invalid_batch_inserts_nothing(): void
    {
        foreach ([['work', 'unknown'], ['season', $this->work], ['banana', '269'], ['universe', $this->work]] as [$type, $id]) {
            $this->postJson('/api/entity/preference', ['target_type' => $type, 'target_id' => $id])->assertUnprocessable();
            $this->postJson('/api/entity/comments', ['target_type' => $type, 'target_id' => $id, 'comment_body' => 'Invalid'])->assertUnprocessable();
        }
        $this->postJson('/api/telemetry/events', ['events' => [['target_type' => 'global', 'event_type' => 'presence_ping'], ['target_type' => 'episode', 'target_id' => 'unknown']]])->assertUnprocessable();
        $this->assertDatabaseCount('user_interaction_events', 0);
        $this->assertDatabaseCount('user_entity_preferences', 0);
        $this->assertNull(app(CatalogActionTarget::class)->canonical('universe', '269'));
        $this->postJson('/api/telemetry/events', ['events' => [['target_type' => 'global', 'event_type' => 'presence_ping']]])->assertOk();
    }

    public function test_duplicate_preferences_merge_without_losing_progress_metadata_or_other_users(): void
    {
        $user = auth()->id();
        $other = User::factory()->create();
        DB::table('user_entity_preferences')->insert([
            ['user_id' => $user, 'target_type' => 'work', 'target_id' => 'anime:269', 'entity_id' => null, 'progress_seconds' => 87, 'user_score' => 8, 'bookmarked' => true, 'metadata' => '{"old":1}', 'last_interacted_at' => '2026-10-20 00:00:00'],
            ['user_id' => $user, 'target_type' => 'work', 'target_id' => $this->work, 'entity_id' => $this->work, 'progress_seconds' => 42, 'user_score' => null, 'bookmarked' => false, 'metadata' => '{"new":2}', 'last_interacted_at' => '2026-10-21 00:00:00'],
            ['user_id' => $other->id, 'target_type' => 'work', 'target_id' => 'anime:269', 'entity_id' => null, 'progress_seconds' => 11, 'user_score' => 3, 'bookmarked' => false, 'metadata' => null, 'last_interacted_at' => '2026-10-21 00:00:00'],
        ]);
        $this->postJson('/api/entity/preference', ['target_type' => 'work', 'target_id' => 'work:269', 'liked' => true])->assertOk()
            ->assertJsonPath('preference.progress_seconds', 87)->assertJsonPath('preference.bookmarked', 1)->assertJsonPath('preference.target_id', $this->work);
        $this->assertDatabaseCount('user_entity_preferences', 2);
        $this->assertDatabaseCount('catalog_action_reconciliations', 2);
        $row = DB::table('user_entity_preferences')->where('user_id', $user)->first();
        $this->assertEquals(['old' => 1, 'new' => 2], json_decode($row->metadata, true));
        $this->assertEquals(8, $row->user_score);
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $other->id, 'progress_seconds' => 11, 'entity_id' => null]);
        app(CatalogActionBackfill::class)->run();
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $other->id, 'progress_seconds' => 11, 'entity_id' => $this->work, 'target_id' => $this->work]);
        $this->assertSame(0, app(CatalogActionBackfill::class)->run()['user_entity_preferences']['linked']);
    }

    public function test_unresolved_entities_cannot_receive_new_actions(): void
    {
        $id = app(CatalogIdentityStore::class)->create('work', ['unresolved-alias'], null, 'unresolved');
        $this->postJson('/api/entity/preference', ['target_type' => 'work', 'target_id' => $id])->assertUnprocessable();
        $this->postJson('/api/entity/comments', ['target_type' => 'work', 'target_id' => 'unresolved-alias', 'comment_body' => 'Invalid'])->assertUnprocessable();
        $this->postJson('/api/telemetry/events', ['events' => [['target_type' => 'work', 'target_id' => $id]]])->assertUnprocessable();
        $this->assertDatabaseCount('user_entity_preferences', 0);
    }
}
