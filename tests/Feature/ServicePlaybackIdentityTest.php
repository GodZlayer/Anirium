<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class ServicePlaybackIdentityTest extends TestCase
{
    use RefreshDatabase;

    private function headers(User $user): array
    {
        config(['services.anirium.service_secret' => 'playback-identity-test-secret']);
        $encode = fn (string $value) => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
        $payload = $encode(json_encode(['accountId' => (string) $user->id, 'deviceId' => 'test-device', 'level' => 2,
            'playerSessionId' => 'test-player-session-1234567890', 'exp' => time() + 300], JSON_THROW_ON_ERROR));

        return ['Authorization' => 'Bearer '.$payload.'.'.$encode(hash_hmac('sha256', $payload, config('services.anirium.service_secret'), true)), 'X-Anirium-Device' => 'test-device'];
    }

    private function work(string $id, string $format = 'TV', array $episodes = []): void
    {
        app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => 'Authoritative title', 'format' => $format,
            'aliases' => ['work:'.$id], 'universe_reference' => $id, 'episodes' => $episodes,
            'references' => [['provider' => 'kitsu', 'media' => 'anime', 'id' => '700']]]);
        $this->mock(CatalogSearch::class)->shouldReceive('summaries')->andReturn(['resolved' => ['work:'.$id => ['work_id' => $id]]]);
    }

    public function test_local_service_obtains_the_sql_episode_context_without_a_browser_session(): void
    {
        $work = (string) Str::uuid();
        $this->work($work, 'TV', [['number' => 9, 'tvdb_season' => 2, 'tvdb_episode_id' => 987]]);
        $episode = DB::table('catalog_episodes')->value('id');
        app(CatalogEpisodeStore::class)->put($work, 49, [], ['tvdb', 'anime:episode:work:'.$work, '987']);
        $user = User::factory()->create(['tier' => 2]);
        $response = $this->postJson('/api/service/playback/context', ['workId' => $work, 'episodeId' => $episode,
            'title' => 'Spoofed title', 'malId' => 999, 'episode' => 1], $this->headers($user))->assertOk()
            ->assertJsonPath('workId', $work)->assertJsonPath('episodeId', $episode)
            ->assertJsonPath('episode', 49)->assertJsonPath('season', 2)->assertJsonPath('title', 'Authoritative title')
            ->assertJsonPath('references.0.provider', 'kitsu')->assertJsonPath('accountId', (string) $user->id);
        $this->assertSame([], $response->headers->getCookies());
        $user->update(['tier' => 1]);
        $this->postJson('/api/service/playback/context', ['workId' => $work, 'episodeId' => $episode], $this->headers($user))->assertForbidden();
    }

    public function test_an_episode_cannot_be_played_as_part_of_another_work(): void
    {
        $work = (string) Str::uuid();
        $this->work($work, 'TV', [['number' => 1]]);
        $episode = DB::table('catalog_episodes')->value('id');
        $headers = $this->headers(User::factory()->create(['tier' => 2]));
        $this->postJson('/api/service/playback/context', ['workId' => (string) Str::uuid(), 'episodeId' => $episode], $headers)->assertNotFound();
        $this->postJson('/api/service/playback/context', ['workId' => $work], $headers)->assertNotFound();
        $this->postJson('/api/service/playback/context', ['workId' => $work, 'episodeId' => $work], $headers)->assertNotFound();
        $this->postJson('/api/service/playback/context', ['workId' => $work, 'episodeId' => $episode])->assertUnauthorized();
    }

    public function test_a_movie_uses_the_work_identity_without_creating_a_fictional_episode(): void
    {
        $work = (string) Str::uuid();
        $this->work($work, 'MOVIE');
        $this->postJson('/api/service/playback/context', ['workId' => $work], $this->headers(User::factory()->create(['tier' => 2])))
            ->assertOk()->assertJsonPath('workId', $work)->assertJsonPath('episodeId', null)->assertJsonPath('format', 'MOVIE');
        $this->assertDatabaseCount('catalog_episodes', 0);
    }
}
