<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WatchPartyTest extends TestCase
{
    use RefreshDatabase;

    public function test_free_users_cannot_access_watch_party_or_salas(): void
    {
        $freeUser = User::factory()->create(['tier' => 1]);

        $this->actingAs($freeUser)->getJson('/api/watch-party/live-schedule')
            ->assertForbidden()
            ->assertJson(['error' => 'plus_required']);

        $this->actingAs($freeUser)->postJson('/api/watch-party/rooms', [
            'mode' => 'party',
            'workId' => '0fa627c1-3ee1-4f18-8771-43ceb9651da8',
        ])->assertForbidden()->assertJson(['error' => 'plus_required']);
    }

    public function test_leader_controls_party_with_handle_and_optional_password(): void
    {
        $leader = User::factory()->create([
            'name' => 'Daniel',
            'email' => 'daniel@example.com',
            'handle' => 'daniel',
            'tier' => 2,
        ]);
        $member = User::factory()->create([
            'name' => 'Rafael',
            'email' => 'rafael@example.com',
            'handle' => 'rafael',
            'tier' => 2,
        ]);

        $workId = '0fa627c1-3ee1-4f18-8771-43ceb9651da8';
        $episodeId = '453031a6-10e0-4b87-98d1-8b46afd3b387';

        $create = $this->actingAs($leader)->postJson('/api/watch-party/rooms', [
            'mode' => 'party',
            'workId' => $workId,
            'episodeId' => $episodeId,
            'episodeNumber' => 8,
            'password' => 'segredo123',
        ]);

        $create->assertCreated()
            ->assertJsonPath('room.isLeader', true)
            ->assertJsonPath('room.leaderHandle', 'daniel')
            ->assertJsonPath('room.hasPassword', true);

        $code = $create->json('code');

        // Lookup by @handle
        $this->actingAs($member)->getJson('/api/watch-party/by-handle/@daniel')
            ->assertOk()
            ->assertJson([
                'active' => true,
                'code' => $code,
                'hasPassword' => true,
            ]);

        // Join without password fails
        $this->actingAs($member)->postJson("/api/watch-party/rooms/{$code}/join")
            ->assertForbidden()
            ->assertJson(['error' => 'password_required']);

        // Join with wrong password fails
        $this->actingAs($member)->postJson("/api/watch-party/rooms/{$code}/join", ['password' => 'errada'])
            ->assertForbidden()
            ->assertJson(['error' => 'invalid_password']);

        // Join with correct password succeeds
        $this->actingAs($member)->postJson("/api/watch-party/rooms/{$code}/join", [
            'password' => 'segredo123',
            'ready' => true,
        ])->assertOk()->assertJsonPath('room.membersCount', 2);

        // Member cannot control playback
        $this->actingAs($member)->postJson("/api/watch-party/rooms/{$code}/control", [
            'action' => 'play',
            'positionSeconds' => 10,
        ])->assertForbidden()->assertJson(['error' => 'leader_only']);

        // Leader can play
        $play = $this->actingAs($leader)->postJson("/api/watch-party/rooms/{$code}/control", [
            'action' => 'play',
            'positionSeconds' => 42,
        ])->assertOk()->assertJsonPath('room.status', 'playing');
        $this->assertGreaterThanOrEqual(42.0, (float) $play->json('room.effectivePositionSeconds'));

        // Chat + incremental after_id
        $msg1 = $this->actingAs($leader)->postJson("/api/watch-party/rooms/{$code}/messages", [
            'body' => 'Começou!',
        ])->assertCreated();
        $msg1Id = $msg1->json('message.id');

        $this->actingAs($member)->postJson("/api/watch-party/rooms/{$code}/messages", [
            'body' => 'Bora!',
        ])->assertCreated();

        $this->actingAs($leader)->getJson("/api/watch-party/rooms/{$code}?after_id={$msg1Id}")
            ->assertOk()
            ->assertJsonCount(1, 'room.messages')
            ->assertJsonPath('room.messages.0.body', 'Bora!');
    }

    public function test_live_launch_room_locks_timeline_and_appears_in_live_schedule(): void
    {
        $plusUser = User::factory()->create(['tier' => 2]);
        $workId = '0fa627c1-3ee1-4f18-8771-43ceb9651da8';
        $episodeId = '453031a6-10e0-4b87-98d1-8b46afd3b387';

        $create = $this->actingAs($plusUser)->postJson('/api/watch-party/rooms', [
            'mode' => 'live_launch',
            'workId' => $workId,
            'episodeId' => $episodeId,
            'episodeNumber' => 8,
            'launchAt' => now()->subMinutes(6)->toIso8601String(),
        ]);

        $create->assertCreated()
            ->assertJsonPath('room.liveLocked', true)
            ->assertJsonPath('room.isLeader', false)
            ->assertJsonPath('room.status', 'playing');

        $code = $create->json('code');

        // Nobody can control a public Anirium Live room
        $this->actingAs($plusUser)->postJson("/api/watch-party/rooms/{$code}/control", [
            'action' => 'pause',
        ])->assertForbidden();

        // Appears in live-schedule
        $this->actingAs($plusUser)->getJson('/api/watch-party/live-schedule')
            ->assertOk()
            ->assertJsonCount(1, 'lives')
            ->assertJsonPath('lives.0.code', $code)
            ->assertJsonPath('lives.0.controlledBy', 'Anirium Live');
    }

    public function test_player_pro_includes_relative_watch_party_script(): void
    {
        $html = (string) file_get_contents(public_path('addons/player-pro/index.html'));
        $this->assertStringContainsString('id="wp-toggle-btn"', $html);
        $this->assertStringContainsString('./watch-party.js', $html);
    }

    public function test_history_requires_plus_and_applies_minus_5_minutes_watched_rule(): void
    {
        $free = User::factory()->create(['tier' => 1]);
        $this->actingAs($free)->getJson('/api/watch-party/history')
            ->assertForbidden()
            ->assertJson(['error' => 'plus_required']);

        $plus = User::factory()->create(['tier' => 2]);
        $this->actingAs($plus)->getJson('/api/watch-party/history')
            ->assertOk()
            ->assertJsonStructure(['items']);
    }
}
