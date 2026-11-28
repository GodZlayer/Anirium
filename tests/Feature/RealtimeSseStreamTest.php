<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\RealtimeEventStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RealtimeSseStreamTest extends TestCase
{
    use RefreshDatabase;

    public function test_stream_returns_sse_headers_and_replays_events_since_last_event_id(): void
    {
        $user = User::factory()->create();
        $store = app(RealtimeEventStore::class);

        $firstId = $store->publish('user:'.$user->id, 'preference.confirmed', [
            'target_type' => 'work',
            'target_id' => 'work-1',
            'preference' => ['user_score' => 9],
        ]);

        $secondId = $store->publish('entity:work:work-1', 'comment.posted', [
            'target_type' => 'work',
            'target_id' => 'work-1',
            'comment' => ['id' => 42, 'comment_body' => 'Excelente episódio!'],
        ]);

        $response = $this->actingAs($user)
            ->withHeaders(['Last-Event-ID' => (string) ($firstId - 1)])
            ->get('/api/stream?once=1&entity_type=work&entity_id=work-1');

        $response->assertOk();
        $this->assertStringContainsString('text/event-stream', (string) $response->headers->get('Content-Type'));

        $body = $response->streamedContent();
        $this->assertStringContainsString("id: {$firstId}", $body);
        $this->assertStringContainsString('event: preference.confirmed', $body);
        $this->assertStringContainsString("id: {$secondId}", $body);
        $this->assertStringContainsString('event: comment.posted', $body);
        $this->assertStringContainsString('Excelente episódio!', $body);
    }

    public function test_stream_isolates_private_user_channels(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $store = app(RealtimeEventStore::class);

        $secretId = $store->publish('user:'.$userB->id, 'pix.paid', [
            'txid' => 'secret-tx-123',
            'status' => 'paid',
        ]);

        $response = $this->actingAs($userA)
            ->withHeaders(['Last-Event-ID' => (string) ($secretId - 1)])
            ->get('/api/stream?once=1');

        $response->assertOk();
        $body = $response->streamedContent();
        $this->assertStringNotContainsString('secret-tx-123', $body);
        $this->assertStringNotContainsString('event: pix.paid', $body);
    }
}
