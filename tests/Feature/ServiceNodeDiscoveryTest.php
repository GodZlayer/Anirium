<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ServiceNodeDiscoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_announce_and_list_multiple_private_lan_nodes(): void
    {
        $user = User::factory()->create();
        Cache::forget("anirium_service_lan_nodes_{$user->id}");

        $this->actingAs($user)
            ->postJson('/api/service/nodes', [
                'lanUrl' => 'http://192.168.1.10:4004',
                'serviceVersion' => '2.4.0',
            ])
            ->assertOk()
            ->assertJsonPath('nodes.0.lanUrl', 'http://192.168.1.10:4004');

        $this->actingAs($user)
            ->postJson('/api/service/nodes', [
                'lanUrl' => 'http://192.168.1.20:4004',
                'serviceVersion' => '2.4.0',
            ])
            ->assertOk();

        $response = $this->actingAs($user)
            ->getJson('/api/service/nodes')
            ->assertOk();

        $nodes = $response->json('nodes');
        $this->assertCount(2, $nodes);
        $this->assertSame('http://192.168.1.20:4004', $nodes[0]['lanUrl']);
        $this->assertSame('http://192.168.1.10:4004', $nodes[1]['lanUrl']);
    }

    public function test_announce_rejects_loopback_and_public_urls(): void
    {
        $user = User::factory()->create();

        foreach ([
            'http://127.0.0.1:4004',
            'http://localhost:4004',
            'http://8.8.8.8:4004',
            'https://192.168.1.10:4004',
            'http://192.168.1.10:4004/extra',
        ] as $invalidUrl) {
            $this->actingAs($user)
                ->postJson('/api/service/nodes', ['lanUrl' => $invalidUrl])
                ->assertStatus(422)
                ->assertJsonPath('reason', 'private_lan_url_required');
        }
    }

    public function test_nodes_are_isolated_per_user(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $this->actingAs($userA)
            ->postJson('/api/service/nodes', ['lanUrl' => 'http://10.0.0.15:4004'])
            ->assertOk();

        $this->actingAs($userB)
            ->getJson('/api/service/nodes')
            ->assertOk()
            ->assertJsonCount(0, 'nodes');
    }
}
