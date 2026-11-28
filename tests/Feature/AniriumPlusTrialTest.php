<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AniriumPlusTrialTest extends TestCase
{
    use RefreshDatabase;

    public function test_google_user_can_activate_15_day_anirium_plus_trial(): void
    {
        $user = User::factory()->create([
            'tier' => 1,
            'google_id' => 'google-sub-1001',
        ]);

        $response = $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '2001:db8:abcd:1234::10'])
            ->postJson('/api/anirium-plus/trial');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('activated', true)
            ->assertJsonPath('tier', 2)
            ->assertJsonPath('trial_days', 15)
            ->assertJsonPath('price_monthly_usd', 0.99);

        $user->refresh();
        $this->assertSame(2, (int) $user->tier);
        $this->assertNotNull($user->anirium_plus_trial_claimed_at);
        $this->assertNotNull($user->anirium_plus_expires_at);
        $this->assertTrue($user->hasActiveAniriumPlus());
    }

    public function test_second_google_account_on_same_ipv6_prefix_is_blocked(): void
    {
        $first = User::factory()->create([
            'tier' => 1,
            'google_id' => 'google-sub-2001',
        ]);
        $second = User::factory()->create([
            'tier' => 1,
            'google_id' => 'google-sub-2002',
        ]);

        $this->actingAs($first)
            ->withServerVariables(['REMOTE_ADDR' => '2001:db8:aaaa:bbbb:1111:2222:3333:4444'])
            ->postJson('/api/anirium-plus/trial')
            ->assertOk();

        // Different IPv6 interface ID within the same /64 prefix must still be blocked
        $this->actingAs($second)
            ->withServerVariables(['REMOTE_ADDR' => '2001:db8:aaaa:bbbb:9999:8888:7777:6666'])
            ->postJson('/api/anirium-plus/trial')
            ->assertStatus(409)
            ->assertJsonPath('code', 'trial_already_used_on_network')
            ->assertJsonPath('price_monthly_usd', 0.99);

        $second->refresh();
        $this->assertSame(1, (int) $second->tier);
    }

    public function test_different_ipv6_prefix_allows_another_google_account(): void
    {
        $first = User::factory()->create([
            'tier' => 1,
            'google_id' => 'google-sub-3001',
        ]);
        $second = User::factory()->create([
            'tier' => 1,
            'google_id' => 'google-sub-3002',
        ]);

        $this->actingAs($first)
            ->withServerVariables(['REMOTE_ADDR' => '2001:db8:1111:0001::1'])
            ->postJson('/api/anirium-plus/trial')
            ->assertOk();

        $this->actingAs($second)
            ->withServerVariables(['REMOTE_ADDR' => '2001:db8:1111:0002::1'])
            ->postJson('/api/anirium-plus/trial')
            ->assertOk()
            ->assertJsonPath('tier', 2);
    }

    public function test_non_google_account_cannot_activate_trial(): void
    {
        $user = User::factory()->create([
            'tier' => 1,
            'google_id' => null,
        ]);

        $this->actingAs($user)
            ->withServerVariables(['REMOTE_ADDR' => '2001:db8:9999:1::1'])
            ->postJson('/api/anirium-plus/trial')
            ->assertStatus(422)
            ->assertJsonPath('code', 'google_account_required');
    }

    public function test_expired_trial_is_no_longer_active_plus(): void
    {
        $user = User::factory()->create([
            'tier' => 2,
            'google_id' => 'google-sub-4001',
            'anirium_plus_trial_claimed_at' => now()->subDays(16),
            'anirium_plus_expires_at' => now()->subDay(),
        ]);

        $this->assertFalse($user->hasActiveAniriumPlus());
    }
}
