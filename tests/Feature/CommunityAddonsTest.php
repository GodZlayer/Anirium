<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Models\User;
use App\Support\RemoteAddonReference;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CommunityAddonsTest extends TestCase
{
    use RefreshDatabase;

    public function test_remote_install_uses_service_reference_without_trusting_manifest_capabilities(): void
    {
        $user = User::factory()->create(['tier' => 2]);
        $reference = RemoteAddonReference::fromUrl('https://fixture.example/config/manifest.json');
        $this->actingAs($user)->postJson('/api/addons/install', [
            'manifest_url' => 'stremio://FIXTURE.example:443/config/manifest.json',
            'manifest' => ['id' => 'player-pro', 'capabilities' => ['ui.player.render']],
        ])->assertOk()->assertJsonPath('addon_id', $reference['id']);
        $row = DB::table('user_addons')->where('user_id', $user->id)->sole();
        $this->assertSame($reference, json_decode($row->manifest_json, true));
        $this->assertSame('community', $row->type);
        $this->postJson('/api/addons/install', ['manifest_url' => $reference['manifestUrl']])->assertOk();
        $this->assertDatabaseCount('user_addons', 1);
    }

    public function test_invalid_and_reserved_manifests_cannot_be_installed(): void
    {
        $this->actingAs(User::factory()->create());
        foreach (['file:///tmp/manifest.json', 'https://user:secret@fixture.example/manifest.json', 'https://fixture.example/manifest.json#fragment', 'https://fixture.example/white space', 'https://fixture.example\\evil/manifest.json'] as $url) {
            $this->postJson('/api/addons/install', ['manifest_url' => $url])->assertUnprocessable();
        }
        $this->postJson('/api/addons/install', ['manifest' => ['id' => 'player-pro']])->assertUnprocessable();
        $this->postJson('/api/addons/install', ['manifest' => ['id' => 'org.fixture', 'resources' => ['stream']]])->assertUnprocessable()->assertJsonPath('error', 'manifest_url_required');
        $this->assertDatabaseCount('user_addons', 0);
    }

    public function test_legacy_url_install_is_authorized_with_current_service_contract_and_can_be_disabled(): void
    {
        $user = User::factory()->create(['tier' => 2]);
        $url = 'https://fixture.example/config/manifest.json';
        DB::table('user_addons')->insert(['user_id' => $user->id, 'addon_id' => 'addon-legacy', 'manifest_url' => $url, 'enabled' => true]);
        $session = $this->actingAs($user)->getJson('/api/service/session', ['x-anirium-device' => 'fixture-device', 'x-anirium-player-session' => 'fixture-player-session-123'])->assertOk();
        $headers = ['Authorization' => 'Bearer '.$session->json('token'), 'X-Anirium-Device' => 'fixture-device'];
        $reference = RemoteAddonReference::fromUrl($url);
        $this->getJson('/api/service/session/validate', $headers)->assertOk()->assertJsonPath('installedAddons.1.id', $reference['id'])->assertJsonPath('installedAddons.1.config', $reference);
        $this->postJson('/api/addons/toggle', ['addon_id' => 'addon-legacy', 'enabled' => false])->assertOk();
        $this->getJson('/api/service/session/validate', $headers)->assertOk()->assertJsonCount(1, 'installedAddons');
    }

    public function test_addon_changes_are_scoped_to_the_account_and_reject_non_boolean_state(): void
    {
        $owner = User::factory()->create();
        DB::table('user_addons')->insert(['user_id' => $owner->id, 'addon_id' => 'fixture', 'enabled' => true]);
        $this->actingAs(User::factory()->create());
        $this->postJson('/api/addons/toggle', ['addon_id' => 'fixture', 'enabled' => false])->assertNotFound();
        $this->postJson('/api/addons/toggle', ['addon_id' => 'fixture', 'enabled' => 'false'])->assertUnprocessable();
        $this->postJson('/api/addons/uninstall', ['addon_id' => 'fixture'])->assertOk();
        $this->assertDatabaseHas('user_addons', ['user_id' => $owner->id, 'addon_id' => 'fixture', 'enabled' => true]);
    }

    public function test_tier_one_can_install_disable_and_remove_a_community_reference(): void
    {
        $this->actingAs(User::factory()->create(['tier' => 1]));
        $reference = RemoteAddonReference::fromUrl('https://fixture.example/community/manifest.json');
        $this->postJson('/api/addons/install', ['manifest_url' => $reference['manifestUrl']])->assertOk();
        $this->assertDatabaseHas('user_addons', ['addon_id' => $reference['id'], 'enabled' => true]);
        $this->getJson('/api/addons')->assertOk();
        $this->postJson('/api/addons/toggle', ['addon_id' => $reference['id'], 'enabled' => false])->assertOk();
        $this->assertDatabaseHas('user_addons', ['addon_id' => $reference['id'], 'enabled' => false]);
        $this->postJson('/api/addons/uninstall', ['addon_id' => $reference['id']])->assertOk();
        $this->assertDatabaseCount('user_addons', 0);
    }

    public function test_guest_cannot_install_or_list_account_addons(): void
    {
        $this->postJson('/api/addons/install', ['manifest_url' => 'https://fixture.example/manifest.json'])->assertUnauthorized();
        $this->getJson('/api/addons')->assertUnauthorized();
    }
}
