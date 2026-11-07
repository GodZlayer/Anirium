<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogActionBackfill;
use App\Support\CatalogActionTarget;
use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogActionBackfillTest extends TestCase
{
    use RefreshDatabase;

    public function test_backfill_preserves_actions_and_leaves_unproven_targets_unresolved(): void
    {
        $work = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work([
            'work_id' => $work, 'media' => 'anime', 'title' => 'Original',
            'aliases' => ['anime:269', '269', 'work:'.$work], 'universe_reference' => $work,
            'episodes' => [['number' => 1, 'titles' => []]],
        ]);
        $user = User::factory()->create();
        DB::table('user_entity_preferences')->insert([
            ['user_id' => $user->id, 'target_type' => 'work', 'target_id' => 'work:269', 'progress_seconds' => 87],
            ['user_id' => $user->id, 'target_type' => 'episode', 'target_id' => 'episode:'.$work.':ep-1', 'progress_seconds' => 42],
            ['user_id' => $user->id, 'target_type' => 'season', 'target_id' => 'season:269:arc-1', 'progress_seconds' => 11],
        ]);
        DB::table('entity_discussions')->insert(['user_id' => $user->id, 'target_type' => 'universe', 'target_id' => 'universe:'.$work, 'comment_body' => 'Keep my comment']);
        $before = DB::table('user_entity_preferences')->orderBy('id')->get()->map(fn (object $row) => [$row->id, $row->target_id, $row->progress_seconds])->all();
        $report = app(CatalogActionBackfill::class)->run();
        $this->assertSame(['linked' => 2, 'unresolved' => 1, 'non_catalog' => 0], $report['user_entity_preferences']);
        $this->assertSame(1, $report['entity_discussions']['linked']);
        $after = DB::table('user_entity_preferences')->orderBy('id')->get();
        $this->assertSame(array_column($before, 0), $after->pluck('id')->all());
        $this->assertSame(array_column($before, 2), $after->pluck('progress_seconds')->all());
        $this->assertSame($work, $after[0]->target_id);
        $this->assertSame($after[1]->entity_id, $after[1]->target_id);
        $this->assertSame('season:269:arc-1', $after[2]->target_id);
        $this->assertDatabaseCount('catalog_action_reconciliations', 3);
        $this->assertDatabaseHas('user_entity_preferences', ['target_type' => 'work', 'entity_id' => $work, 'progress_seconds' => 87]);
        $this->assertDatabaseHas('user_entity_preferences', ['target_type' => 'episode', 'entity_id' => DB::table('catalog_episodes')->value('id'), 'progress_seconds' => 42]);
        $this->assertDatabaseHas('entity_discussions', ['entity_id' => DB::table('catalog_universes')->value('id'), 'comment_body' => 'Keep my comment']);
        $this->assertNull(app(CatalogActionTarget::class)->legacy('season', 'season:269:arc-1'));
        $this->assertNull(app(CatalogActionTarget::class)->legacy('episode', $work));
        $this->assertSame(0, app(CatalogActionBackfill::class)->run()['user_entity_preferences']['linked']);
    }
}
