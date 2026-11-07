<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleAccountIdentityTest extends TestCase
{
    use RefreshDatabase;

    private function claims(string $email): array
    {
        return ['aud' => 'test-client', 'iss' => 'https://accounts.google.com', 'exp' => time() + 3600,
            'sub' => 'google-'.hash('sha256', $email), 'email' => $email, 'email_verified' => 'true'];
    }

    public function test_verified_google_login_preserves_provisioned_ids_and_tiers(): void
    {
        config(['services.google.client_id' => 'test-client']);
        $other = User::factory()->create(['tier' => 3]);
        Http::fake(['oauth2.googleapis.com/tokeninfo*' => Http::sequence()
            ->push($this->claims('santoss.cog@gmail.com'))
            ->push($this->claims('dnleventos@gmail.com'))]);
        foreach (['santoss.cog@gmail.com' => 3, 'dnleventos@gmail.com' => 2] as $email => $tier) {
            $user = User::factory()->create(['email' => $email, 'google_id' => null, 'tier' => $tier]);
            $this->postJson('/api/auth/google', ['credential' => 'verified-test-token'])
                ->assertOk()->assertJsonPath('user.id', $user->id)->assertJsonPath('user.tier', $tier);
            $this->assertAuthenticatedAs($user);
            $this->assertDatabaseHas('users', ['id' => $user->id, 'email' => $email, 'tier' => $tier, 'google_id' => $this->claims($email)['sub']]);
        }
        $this->assertSame(1, (int) $other->fresh()->tier);
        $this->assertDatabaseCount('users', 3);
    }

    public function test_failed_provider_validation_cannot_be_bypassed_with_a_decodable_jwt(): void
    {
        config(['services.google.client_id' => 'test-client']);
        $claims = $this->claims('santoss.cog@gmail.com');
        $forged = 'e30.'.rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR)), '+/', '-_'), '=').'.invalid';
        $invalidClaims = [['aud' => 'another-client'], ['iss' => 'https://example.org'], ['exp' => time() - 10], ['email_verified' => 'false'], ['sub' => '']];
        $sequence = Http::sequence()->push(['error' => 'invalid_token'], 400);
        foreach ($invalidClaims as $invalid) {
            $sequence->push([...$claims, ...$invalid]);
        }
        Http::fake(['oauth2.googleapis.com/tokeninfo*' => $sequence]);
        $this->postJson('/api/auth/google', ['credential' => $forged])->assertStatus(400);
        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
        foreach ($invalidClaims as $invalid) {
            $this->postJson('/api/auth/google', ['credential' => 'invalid-claims'])->assertStatus(400);
            $this->assertGuest();
        }
        $this->assertDatabaseCount('users', 0);
    }

    public function test_duplicate_account_conflict_does_not_delete_an_existing_identity(): void
    {
        config(['services.google.client_id' => 'test-client']);
        $email = 'dnleventos@gmail.com';
        User::factory()->create(['email' => $email, 'tier' => 2, 'google_id' => null]);
        User::factory()->create(['email' => strtoupper($email), 'google_id' => null]);
        Http::fake(['oauth2.googleapis.com/tokeninfo*' => Http::response($this->claims($email))]);
        $this->postJson('/api/auth/google', ['credential' => 'verified-test-token'])
            ->assertStatus(409)->assertJsonPath('error', 'account_identity_conflict');
        $this->assertGuest();
        $this->assertDatabaseCount('users', 2);
    }
}
