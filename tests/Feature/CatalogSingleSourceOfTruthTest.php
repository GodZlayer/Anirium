<?php

namespace Tests\Feature;

use App\Services\Cache\InMemoryCatalogService;
use App\Support\CatalogRevisionRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogSingleSourceOfTruthTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_reads_only_releasing_works_from_database_and_ignores_synthetic_literature(): void
    {
        $releasingAnimeId = (string) Str::uuid();
        $completedAnimeId = (string) Str::uuid();
        $syntheticMangaId = (string) Str::uuid();

        DB::table('catalog_entities')->insert([
            ['id' => $releasingAnimeId, 'kind' => 'work', 'resolution_status' => 'verified'],
            ['id' => $completedAnimeId, 'kind' => 'work', 'resolution_status' => 'verified'],
            ['id' => $syntheticMangaId, 'kind' => 'work', 'resolution_status' => 'verified'],
        ]);

        DB::table('catalog_works')->insert([
            [
                'id' => $releasingAnimeId,
                'media' => 'anime',
                'title' => 'Active Seasonal Anime',
                'format' => 'TV',
                'status' => 'RELEASING',
                'episode_count' => 12,
                'is_adult' => 0,
            ],
            [
                'id' => $completedAnimeId,
                'media' => 'anime',
                'title' => 'Finished Anime',
                'format' => 'TV',
                'status' => 'COMPLETED',
                'episode_count' => 12,
                'is_adult' => 0,
            ],
            [
                'id' => $syntheticMangaId,
                'media' => 'manga',
                'title' => 'Synthetic Manga',
                'format' => 'MANGA',
                'status' => 'RELEASING',
                'episode_count' => null,
                'is_adult' => 0,
            ],
        ]);

        DB::table('catalog_work_assets')->insert([
            ['work_id' => $releasingAnimeId, 'image_url' => 'https://example.com/a.jpg'],
            ['work_id' => $completedAnimeId, 'image_url' => 'https://example.com/b.jpg'],
            ['work_id' => $syntheticMangaId, 'image_url' => 'https://example.com/c.jpg'],
        ]);

        DB::table('catalog_work_schedules')->insert([
            [
                'work_id' => $releasingAnimeId,
                'airing_day' => 'Monday',
                'airing_time' => '14:30',
                'latest_episode_num' => 7,
            ],
            [
                'work_id' => $completedAnimeId,
                'airing_day' => 'Monday',
                'airing_time' => '15:00',
                'latest_episode_num' => 12,
            ],
            [
                'work_id' => $syntheticMangaId,
                'airing_day' => 'Monday',
                'airing_time' => '00:00',
                'latest_episode_num' => 1,
            ],
        ]);

        app(CatalogRevisionRecorder::class)->invalidateCaches();
        $calendar = app(InMemoryCatalogService::class)->getCalendarByDay(false);

        $mondayIds = array_column($calendar['mondays'], 'id');
        $this->assertSame([$releasingAnimeId], $mondayIds);
        $this->assertSame(7, $calendar['mondays'][0]['episode']);

        $this->getJson('/api/catalog/feed?view=calendar')
            ->assertOk()
            ->assertJsonPath('source', 'ssot')
            ->assertJsonPath('total', 1)
            ->assertJsonPath('items.0.id', $releasingAnimeId);
    }

    public function test_sync_endpoints_return_version_snapshot_with_multi_titles_and_incremental_delta(): void
    {
        $workId = (string) Str::uuid();
        DB::table('catalog_entities')->insert([
            'id' => $workId,
            'kind' => 'work',
            'resolution_status' => 'verified',
        ]);
        DB::table('catalog_works')->insert([
            'id' => $workId,
            'media' => 'anime',
            'title' => 'Sousou no Frieren',
            'format' => 'TV',
            'status' => 'RELEASING',
            'episode_count' => 28,
            'is_adult' => 0,
        ]);

        DB::table('catalog_work_assets')->insert([
            'work_id' => $workId,
            'image_url' => 'https://example.com/frieren.jpg',
        ]);

        DB::table('catalog_entity_titles')->insert([
            ['entity_id' => $workId, 'locale' => 'en-US', 'title' => 'Frieren: Beyond Journey\'s End'],
            ['entity_id' => $workId, 'locale' => 'pt-BR', 'title' => 'Frieren e a Jornada para o Além'],
        ]);

        $recorder = app(CatalogRevisionRecorder::class);
        $rev1 = $recorder->recordBatch('test', [$workId], 'upsert', 'work');

        $this->getJson('/api/catalog/version')
            ->assertOk()
            ->assertJsonPath('revision', $rev1)
            ->assertJsonPath('works_count', 1);

        $snapshot = $this->getJson('/api/catalog/snapshot')
            ->assertOk()
            ->assertJsonPath('revision', $rev1)
            ->assertJsonPath('count', 1);

        $titles = $snapshot->json('items.0.titles');
        $this->assertContains('Sousou no Frieren', $titles);
        $this->assertContains('Frieren e a Jornada para o Além', $titles);

        // Delta sem novas alterações deve vir vazio
        $this->getJson("/api/catalog/delta?since={$rev1}")
            ->assertOk()
            ->assertJsonPath('upserts', [])
            ->assertJsonPath('deletes', []);

        // Nova alteração gera bloco incremental
        DB::table('catalog_works')->where('id', $workId)->update(['status' => 'COMPLETED']);
        $rev2 = $recorder->recordBatch('test', [$workId], 'upsert', 'work');

        $this->getJson("/api/catalog/delta?since={$rev1}")
            ->assertOk()
            ->assertJsonPath('revision', $rev2)
            ->assertJsonPath('upserts.0.id', $workId)
            ->assertJsonPath('upserts.0.status', 'COMPLETED');
    }
}
