<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountAchievementTest extends TestCase
{
    use RefreshDatabase;

    public function test_equipped_title_is_an_id_and_legacy_labels_are_normalized_only_at_entry(): void
    {
        $user = User::factory()->create(['tier' => 2]);
        $this->actingAs($user)->postJson('/api/account/settings', ['custom_title_id' => 'achievement.plus'])->assertOk();
        $this->assertSame('achievement.plus', $user->fresh()->custom_title);
        $this->postJson('/api/account/settings', ['custom_title' => 'Membro Conectado'])->assertOk();
        $this->assertSame('achievement.member', $user->fresh()->custom_title);
        $this->postJson('/api/account/settings', ['custom_title_id' => null])->assertOk();
        $this->assertNull($user->fresh()->custom_title);
    }

    public function test_unknown_or_unearned_title_cannot_be_equipped_even_with_a_claimed_level(): void
    {
        $user = User::factory()->create(['tier' => 1]);
        foreach (['not-a-title', 'achievement.admin', 'achievement.level-5'] as $id) {
            $this->actingAs($user)->postJson('/api/account/settings', ['custom_title_id' => $id, 'level' => 1000])->assertUnprocessable();
        }
        $this->assertNull($user->fresh()->custom_title);
    }
}
