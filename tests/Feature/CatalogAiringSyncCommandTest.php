<?php

namespace Tests\Feature;

use App\Support\CatalogGraphImporter;
use App\Support\CatalogPipelineProcessLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class CatalogAiringSyncCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.pipeline_lock_path' => storage_path('framework/testing/airing-pipeline-'.bin2hex(random_bytes(8)).'.lock')]);
    }

    protected function tearDown(): void
    {
        @unlink(config('catalog.pipeline_lock_path'));
        parent::tearDown();
    }

    public function test_shared_cache_lock_blocks_airing_sync_without_http_requests(): void
    {
        $lock = Cache::lock('anirium-catalog-pipeline', 60);
        $this->assertTrue($lock->get());
        Http::preventStrayRequests();

        try {
            $this->artisan('catalog:sync-airing')->assertFailed();
            Http::assertNothingSent();
        } finally {
            $lock->release();
        }
    }

    public function test_process_lock_blocks_airing_sync_without_http_requests(): void
    {
        $owner = new CatalogPipelineProcessLock;
        $this->assertTrue($owner->acquire());
        Http::preventStrayRequests();

        try {
            $this->artisan('catalog:sync-airing')->assertFailed();
            Http::assertNothingSent();
        } finally {
            $owner->release();
        }
    }

    public function test_airing_sync_updates_published_index_and_manifest_checksum_and_revision(): void
    {
        $this->travelTo('2026-11-18 12:00:00');
        $workId = (string) Str::uuid();
        $generation = (string) Str::uuid();
        $tempDir = storage_path('framework/testing/airing-sync-'.bin2hex(random_bytes(8)));
        $indexDir = $tempDir.DIRECTORY_SEPARATOR.'indexes';
        $manifestPath = $tempDir.DIRECTORY_SEPARATOR.'catalog.manifest.json';
        $indexPath = $indexDir.DIRECTORY_SEPARATOR.$generation.'.sqlite';

        File::ensureDirectoryExists($indexDir);

        app(CatalogGraphImporter::class)->work([
            'work_id' => $workId,
            'media' => 'anime',
            'title' => 'Airing Fixture',
            'status' => 'RELEASING',
            'episode_count' => 12,
            'aliases' => ['work:'.$workId, 'anime:11757'],
            'references' => [['provider' => 'mal', 'media' => 'anime', 'id' => '11757']],
            'universe_reference' => $workId,
        ]);

        $pdo = new PDO('sqlite:'.$indexPath, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('CREATE TABLE works (work_id TEXT PRIMARY KEY, media TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL)');
        $initialSummary = json_encode([
            'work_id' => $workId,
            'mal_id' => 11757,
            'status' => 'RELEASING',
            'episode_count' => 12,
            'latest_episode_num' => 1,
        ], JSON_THROW_ON_ERROR);
        $pdo->prepare('INSERT INTO works (work_id, media, title, summary) VALUES (?, ?, ?, ?)')->execute([$workId, 'anime', 'Airing Fixture', $initialSummary]);
        $pdo = null;

        $filesPayload = [['url' => "/data/catalog/v2/{$generation}/anime-00000.parquet", 'sha256' => str_repeat('a', 64)]];
        $lookupPayload = ['url' => "/data/catalog/v2/{$generation}/lookup.json", 'sha256' => str_repeat('b', 64)];
        $initialManifest = [
            'schema' => 2,
            'generation' => $generation,
            'files' => $filesPayload,
            'lookup' => $lookupPayload,
            'search' => [
                'schema' => 2,
                'generation' => $generation,
                'sha256' => str_repeat('0', 64),
                'works' => 1,
            ],
            'revision' => str_repeat('c', 64),
        ];
        file_put_contents($manifestPath, json_encode($initialManifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));

        config([
            'catalog.manifest' => $manifestPath,
            'catalog.indexes' => $indexDir,
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://graphql.anilist.co' => function (HttpRequest $request) {
                $query = (string) ($request->data()['query'] ?? '');
                if (str_contains($query, 'airingSchedules(')) {
                    return Http::response([
                        'data' => [
                            'Page' => [
                                'pageInfo' => ['hasNextPage' => false],
                                'airingSchedules' => [
                                    [
                                        'airingAt' => 1700000000,
                                        'episode' => 4,
                                        'media' => [
                                            'id' => 11757,
                                            'idMal' => 11757,
                                            'format' => 'TV',
                                            'status' => 'RELEASING',
                                            'episodes' => 24,
                                            'title' => [
                                                'english' => 'Airing Fixture',
                                                'romaji' => 'Airing Fixture',
                                                'native' => 'Airing Fixture',
                                            ],
                                            'synonyms' => [],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ]);
                }

                return Http::response([
                    'data' => [
                        'Page' => [
                            'pageInfo' => ['hasNextPage' => false],
                            'media' => [],
                        ],
                    ],
                ]);
            },
        ]);

        try {
            $this->artisan('catalog:sync-airing')->assertSuccessful();

            $verifyPdo = new PDO('sqlite:'.$indexPath, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $updatedJson = (string) $verifyPdo->query("SELECT summary FROM works WHERE work_id = '{$workId}'")->fetchColumn();
            $verifyPdo = null;

            $updatedSummary = json_decode($updatedJson, true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame(4, $updatedSummary['latest_episode_num']);
            $this->assertSame('Tuesday', $updatedSummary['airing_day']);
            $this->assertSame('22:13', $updatedSummary['airing_time']);
            $this->assertSame('Asia/Tokyo', $updatedSummary['airing_timezone']);
            $this->assertSame(24, $updatedSummary['episode_count']);

            $actualSha256 = hash_file('sha256', $indexPath);
            $updatedManifest = json_decode((string) file_get_contents($manifestPath), true, flags: JSON_THROW_ON_ERROR);
            $expectedCanonicalRevisionInput = '{"files":[{"url":"/data/catalog/v2/'.$generation.'/anime-00000.parquet","sha256":"'.str_repeat('a', 64).'"}],"lookup":{"url":"/data/catalog/v2/'.$generation.'/lookup.json","sha256":"'.str_repeat('b', 64).'"},"search":{"schema":2,"generation":"'.$generation.'","sha256":"'.$actualSha256.'","works":1}}';

            $this->assertSame($actualSha256, $updatedManifest['search']['sha256']);
            $this->assertSame(hash('sha256', $expectedCanonicalRevisionInput), $updatedManifest['revision']);
        } finally {
            File::deleteDirectory($tempDir);
        }
    }

    public function test_airing_sync_resolves_releasing_anime_only_and_is_idempotent_on_repeat(): void
    {
        $releasingAnimeId = (string) Str::uuid();
        $releasingMangaId = (string) Str::uuid();
        $finishedAnimeId = (string) Str::uuid();
        $importer = app(CatalogGraphImporter::class);

        $importer->work([
            'work_id' => $releasingAnimeId,
            'media' => 'anime',
            'title' => 'Tracked Releasing Anime',
            'status' => 'RELEASING',
            'episode_count' => null,
            'aliases' => ['work:'.$releasingAnimeId, 'anime:59741'],
            'references' => [['provider' => 'mal', 'media' => 'anime', 'id' => '59741']],
            'universe_reference' => $releasingAnimeId,
        ]);

        $importer->work([
            'work_id' => $releasingMangaId,
            'media' => 'manga',
            'title' => 'Same Mal Id Manga',
            'status' => 'RELEASING',
            'episode_count' => null,
            'aliases' => ['work:'.$releasingMangaId],
            'references' => [['provider' => 'mal', 'media' => 'manga', 'id' => '59741']],
            'universe_reference' => $releasingMangaId,
        ]);

        $importer->work([
            'work_id' => $finishedAnimeId,
            'media' => 'anime',
            'title' => 'Finished Anime',
            'status' => 'FINISHED',
            'episode_count' => 12,
            'aliases' => ['work:'.$finishedAnimeId, 'anime:99999'],
            'references' => [['provider' => 'mal', 'media' => 'anime', 'id' => '99999']],
            'universe_reference' => $finishedAnimeId,
        ]);

        $queriedMalIds = [];
        $futureAiringAt = time() + (5 * 86400);

        Http::preventStrayRequests();
        Http::fake([
            'https://graphql.anilist.co' => function (HttpRequest $request) use (&$queriedMalIds, $futureAiringAt) {
                $query = (string) ($request->data()['query'] ?? '');
                if (str_contains($query, 'airingSchedules(')) {
                    return Http::response([
                        'data' => [
                            'Page' => [
                                'pageInfo' => ['hasNextPage' => false],
                                'airingSchedules' => [],
                            ],
                        ],
                    ]);
                }

                if (str_contains($query, 'idMal_in:')) {
                    $ids = array_map('intval', $request->data()['variables']['ids'] ?? []);
                    $queriedMalIds = array_merge($queriedMalIds, $ids);

                    return Http::response([
                        'data' => [
                            'Page' => [
                                'media' => [
                                    [
                                        'id' => 180000,
                                        'idMal' => 59741,
                                        'status' => 'RELEASING',
                                        'episodes' => 12,
                                        'title' => [
                                            'english' => 'Tracked Releasing Anime EN',
                                            'romaji' => 'Tracked Releasing Anime',
                                            'native' => 'Tracked Releasing Anime JP',
                                        ],
                                        'synonyms' => ['Tracked Alias'],
                                        'nextAiringEpisode' => [
                                            'airingAt' => $futureAiringAt,
                                            'episode' => 4,
                                        ],
                                        'airingSchedule' => [
                                            'nodes' => [
                                                ['airingAt' => 1700000000, 'episode' => 1],
                                                ['airingAt' => 1700604800, 'episode' => 2],
                                                ['airingAt' => 1701209600, 'episode' => 3],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ]);
                }

                return Http::response([
                    'data' => [
                        'Page' => [
                            'pageInfo' => ['hasNextPage' => false],
                            'media' => [],
                        ],
                    ],
                ]);
            },
        ]);

        $this->artisan('catalog:sync-airing')->assertSuccessful();

        $this->assertContains(59741, $queriedMalIds);
        $this->assertNotContains(99999, $queriedMalIds);
        $this->assertSame(12, (int) DB::table('catalog_works')->where('id', $releasingAnimeId)->value('episode_count'));
        $this->assertSame(3, DB::table('catalog_episodes')->where('work_id', $releasingAnimeId)->count());
        $this->assertSame(3, (int) DB::table('catalog_work_schedules')->where('work_id', $releasingAnimeId)->value('latest_episode_num'));
        $this->assertSame(0, DB::table('catalog_episodes')->where('work_id', $releasingMangaId)->count());
        $this->assertFalse(DB::table('catalog_work_schedules')->where('work_id', $releasingMangaId)->exists());

        $this->artisan('catalog:sync-airing')->assertSuccessful();

        $this->assertSame(3, DB::table('catalog_episodes')->where('work_id', $releasingAnimeId)->count());
        $this->assertSame(3, (int) DB::table('catalog_work_schedules')->where('work_id', $releasingAnimeId)->value('latest_episode_num'));
    }

    public function test_airing_sync_corrects_stale_future_air_date_utc_for_already_aired_episodes(): void
    {
        $workId = (string) Str::uuid();
        $pastTs = time() - 3600;
        $staleFutureIso = gmdate('Y-m-d\TH:i:s.000\Z', time() + (5 * 86400));

        app(CatalogGraphImporter::class)->work([
            'work_id' => $workId,
            'media' => 'anime',
            'title' => 'Tempal: Item no Chikara',
            'status' => 'RELEASING',
            'episode_count' => 12,
            'aliases' => ['work:'.$workId, 'anime:64340'],
            'references' => [['provider' => 'mal', 'media' => 'anime', 'id' => '64340']],
            'universe_reference' => $workId,
            'episodes' => [
                ['number' => 9, 'air_date_utc' => $staleFutureIso],
            ],
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://graphql.anilist.co' => function (HttpRequest $request) use ($pastTs) {
                $query = (string) ($request->data()['query'] ?? '');
                if (str_contains($query, 'airingSchedules(')) {
                    return Http::response([
                        'data' => [
                            'Page' => [
                                'pageInfo' => ['hasNextPage' => false],
                                'airingSchedules' => [
                                    [
                                        'airingAt' => $pastTs,
                                        'episode' => 9,
                                        'media' => [
                                            'id' => 212888,
                                            'idMal' => 64340,
                                            'format' => 'TV',
                                            'status' => 'RELEASING',
                                            'episodes' => 12,
                                            'title' => [
                                                'english' => 'Overgeared',
                                                'romaji' => 'Tempal: Item no Chikara',
                                                'native' => '템빨',
                                            ],
                                            'synonyms' => [],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ]);
                }

                return Http::response([
                    'data' => [
                        'Page' => [
                            'pageInfo' => ['hasNextPage' => false],
                            'media' => [],
                        ],
                    ],
                ]);
            },
        ]);

        $this->artisan('catalog:sync-airing')->assertSuccessful();

        $updatedAirDate = DB::table('catalog_episodes')
            ->where('work_id', $workId)
            ->where('number', 9)
            ->value('air_date_utc');

        $this->assertSame(gmdate('Y-m-d\TH:i:s.000\Z', $pastTs), $updatedAirDate);
        $this->assertSame(9, (int) DB::table('catalog_work_schedules')->where('work_id', $workId)->value('latest_episode_num'));
    }
}
