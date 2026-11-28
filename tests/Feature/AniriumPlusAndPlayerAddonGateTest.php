<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AniriumPlusAndPlayerAddonGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_tier_one_user_is_blocked_from_interactions_history_calendar_and_watch_party(): void
    {
        $user = User::factory()->create(['tier' => 1]);

        $this->actingAs($user)
            ->postJson('/api/entity/preference', [
                'target_type' => 'work',
                'target_id' => '00000000-0000-4000-8000-000000000001',
                'bookmarked' => true,
                'user_score' => 9,
            ])
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');

        $this->actingAs($user)
            ->postJson('/api/entity/comments', [
                'target_type' => 'work',
                'target_id' => '00000000-0000-4000-8000-000000000001',
                'comment_body' => 'Comentário teste',
            ])
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');

        $this->actingAs($user)
            ->getJson('/api/account/library?view=history')
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');

        $this->actingAs($user)
            ->getJson('/api/account/library?view=bookmarks')
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');

        $this->actingAs($user)
            ->getJson('/api/catalog/feed?view=calendar')
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');

        $this->actingAs($user)
            ->getJson('/api/watch-party/history')
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');

        $this->actingAs($user)
            ->getJson('/api/watch-party/live-schedule')
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');
    }

    public function test_expired_anirium_plus_user_is_blocked_from_plus_features(): void
    {
        $user = User::factory()->create([
            'tier' => 2,
            'anirium_plus_expires_at' => now()->subDay(),
        ]);

        $this->actingAs($user)
            ->postJson('/api/entity/preference', [
                'target_type' => 'work',
                'target_id' => '00000000-0000-4000-8000-000000000001',
                'bookmarked' => true,
            ])
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');

        $this->actingAs($user)
            ->getJson('/api/watch-party/live-schedule')
            ->assertStatus(403)
            ->assertJsonPath('error', 'plus_required');
    }

    public function test_tier_one_user_can_still_manage_community_addons(): void
    {
        $user = User::factory()->create(['tier' => 1]);

        $this->actingAs($user)
            ->getJson('/api/addons')
            ->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    public function test_inertia_shares_has_player_addon_accurately_for_plus_and_community_addons(): void
    {
        $middleware = app(HandleInertiaRequests::class);

        $shareFor = function (User $user) use ($middleware): array {
            $request = Request::create('/', 'GET');
            $request->setUserResolver(fn () => $user);

            return $middleware->share($request);
        };

        $tier1 = User::factory()->create(['tier' => 1]);
        $this->assertFalse($shareFor($tier1)['auth']['user']['has_player_addon']);

        DB::table('user_addons')->insert([
            'user_id' => $tier1->id,
            'addon_id' => 'community-video-player',
            'name' => 'Community Video Player',
            'version' => '1.0.0',
            'type' => 'community',
            'manifest_json' => json_encode([
                'id' => 'community-video-player',
                'category' => 'engine.renderer',
                'mediaType' => 'video',
                'capabilities' => ['ui.player.render'],
            ]),
            'enabled' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertTrue($shareFor($tier1->fresh())['auth']['user']['has_player_addon']);

        $plusUser = User::factory()->create([
            'tier' => 2,
            'anirium_plus_expires_at' => now()->addDays(30),
        ]);

        $this->assertTrue($shareFor($plusUser)['auth']['user']['has_player_addon']);

        DB::table('user_addons')->insert([
            'user_id' => $plusUser->id,
            'addon_id' => 'player-pro',
            'name' => 'Anirium Player Pro',
            'version' => '1.0.0',
            'type' => 'official-plus',
            'enabled' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertFalse($shareFor($plusUser->fresh())['auth']['user']['has_player_addon']);
    }
}
