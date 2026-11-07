<?php

namespace Tests\Feature;

use App\Support\CatalogEpisodeFeed;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogEpisodeFeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_home_selects_episode_ids_by_current_instant_without_work_status_or_count_guesses(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 25)->setTime(12, 0));
        $first = (string) Str::uuid();
        $second = (string) Str::uuid();
        foreach ([$first => [1 => '-1 hour', 2 => '-2 hours', 3 => '+1 hour'], $second => [1 => '-30 minutes', 2 => null, 3 => '2026-10-24']] as $id => $records) {
            app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => $id, 'status' => 'FINISHED', 'episode_count' => 100,
                'aliases' => [], 'universe_reference' => $id,
                'episodes' => array_map(fn ($number, $date) => ['number' => $number, 'air_date_utc' => $date && str_starts_with($date, '-') || $date && str_starts_with($date, '+') ? now()->modify($date)->toISOString() : $date], array_keys($records), array_values($records))]);
        }
        $catalog = $this->mock(CatalogSearch::class);
        $catalog->shouldReceive('summaries')->andReturnUsing(fn ($refs) => ['generation' => 'fixture', 'resolved' => collect($refs)->mapWithKeys(fn ($ref) => [$ref => ['summary' => ['work_id' => substr($ref, 5), 'title' => $ref]]])->all()]);
        $feed = app(CatalogEpisodeFeed::class)->read($catalog, 'fixture', false);
        $this->assertSame([$second, $first, $first], array_column($feed['items'], 'work_id'));
        $this->assertSame([1, 1, 2], array_column(array_column($feed['items'], 'release'), 'number'));
        $this->assertCount(3, array_unique(array_column(array_column($feed['items'], 'release'), 'id')));
        $this->assertSame(now()->addHour()->toISOString(), $feed['next_release_at']);
        $this->travel(1)->hours();
        $later = app(CatalogEpisodeFeed::class)->read($catalog, 'fixture', false);
        $this->assertSame(3, $later['items'][0]['release']['number']);
        $this->assertSame($first, $later['items'][0]['work_id']);
    }

    public function test_unavailable_or_quarantined_works_are_skipped_without_filling_with_other_work_counts(): void
    {
        $ids = [];
        for ($index = 0; $index < 4; $index++) {
            $id = (string) Str::uuid();
            $ids[] = $id;
            app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => $id, 'aliases' => [], 'universe_reference' => $id,
                'episodes' => [['number' => 1, 'air_date_utc' => now()->subMinutes($index + 1)->toISOString()]]]);
        }
        $catalog = $this->mock(CatalogSearch::class);
        $catalog->shouldReceive('summaries')->andReturn(['generation' => 'fixture', 'resolved' => [
            'work:'.$ids[1] => ['summary' => ['work_id' => $ids[1], 'catalog_visibility' => 'quarantined']],
            'work:'.$ids[2] => ['summary' => ['work_id' => $ids[2]]],
            'work:'.$ids[3] => ['summary' => ['work_id' => $ids[3]]],
        ]]);
        $feed = app(CatalogEpisodeFeed::class)->read($catalog, 'fixture', false);
        $this->assertSame([$ids[2], $ids[3]], array_column($feed['items'], 'work_id'));
        $this->assertSame(2, $feed['total']);
    }
}
