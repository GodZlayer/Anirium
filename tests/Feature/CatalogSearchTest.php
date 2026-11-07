<?php

namespace Tests\Feature;

use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class CatalogSearchTest extends TestCase
{
    use RefreshDatabase;

    private string $directory;

    protected function setUp(): void
    {
        parent::setUp();
        $this->directory = storage_path('framework/testing/catalog-'.Str::uuid());
        File::ensureDirectoryExists($this->directory);
        config(['catalog.manifest' => $this->directory.'/manifest.json', 'catalog.indexes' => $this->directory,
            'cache.limiter' => 'rate_limit', 'cache.stores.rate_limit.path' => $this->directory.'/limiter', 'cache.stores.rate_limit.lock_path' => $this->directory.'/limiter-locks']);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->directory);
        parent::tearDown();
    }

    private function index(): void
    {
        $generation = (string) Str::uuid();
        File::put(config('catalog.manifest'), json_encode(['schema' => 2, 'generation' => $generation, 'search' => ['schema' => 2, 'generation' => $generation]]));
        $db = new PDO('sqlite:'.$this->directory.'/'.$generation.'.sqlite');
        $db->exec("CREATE TABLE works(work_id TEXT PRIMARY KEY, media TEXT, score REAL, year INTEGER, adult INTEGER, summary TEXT, partition_url TEXT); CREATE TABLE aliases(reference TEXT PRIMARY KEY, work_id TEXT); CREATE VIRTUAL TABLE search USING fts5(work_id UNINDEXED, terms, tokenize='unicode61 remove_diacritics 2')");
        $insert = $db->prepare('INSERT INTO works VALUES(?, ?, ?, ?, ?, ?, ?)');
        $search = $db->prepare('INSERT INTO search VALUES(?, ?)');
        foreach ([['anime', 'Sword Art Online', 0], ['novel', 'Sword Art Online Novel', 0], ['manga', 'Ação', 0], ['manga', 'Adult title', 1]] as $number => [$media, $title, $adult]) {
            $id = (string) Str::uuid();
            $insert->execute([$id, $media, 8, 2026, $adult, json_encode(['work_id' => $id, 'title' => $title, 'status' => 'RELEASING', 'airing_day' => 'monday', 'airing_time' => '10:00', 'airing_timezone' => 'UTC']), '/data/catalog/v2/'.$generation.'/'.$media.'-00000.parquet']);
            $db->prepare('INSERT INTO aliases VALUES(?, ?)')->execute([$media.':'.($number + 1), $id]);
            $db->prepare('INSERT INTO aliases VALUES(?, ?)')->execute(['work:'.$id, $id]);
            if ($media === 'anime') {
                app(CatalogGraphImporter::class)->work(['work_id' => $id, 'media' => 'anime', 'title' => $title, 'aliases' => [], 'universe_reference' => $id,
                    'episodes' => [['number' => 1, 'air_date_utc' => now()->subMinute()->toISOString()]]]);
            }
            $search->execute([$id, $title]);
        }
    }

    public function test_live_feeds_use_anime_only_and_validate_the_view(): void
    {
        $this->index();
        $this->getJson('/api/catalog/feed?view=home')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('items.0.title', 'Sword Art Online');
        $this->getJson('/api/catalog/feed?view=calendar')->assertOk()->assertJsonCount(1, 'items');
        $this->getJson('/api/catalog/feed?view=../../private')->assertUnprocessable();
        $this->getJson('/api/catalog/feed?view=calendar&page=0')->assertUnprocessable();
    }

    public function test_internal_work_uuid_resolves_without_an_external_or_wrapped_alias(): void
    {
        $this->index();
        $uuid = $this->getJson('/api/catalog/work/anime:1')->assertOk()->json('work_id');
        $this->getJson('/api/catalog/work/'.$uuid)->assertOk()->assertJsonPath('work_id', $uuid);
        $this->getJson('/api/catalog/work/work:'.$uuid)->assertOk()->assertJsonPath('work_id', $uuid);
    }

    public function test_future_release_dates_and_missing_timezone_cannot_be_live_calendar_entries(): void
    {
        $this->index();
        $manifest = json_decode(File::get(config('catalog.manifest')), true);
        $db = new PDO('sqlite:'.$this->directory.'/'.$manifest['generation'].'.sqlite');
        $db->exec('UPDATE works SET year='.((int) date('Y') + 1)." WHERE media='anime'");
        DB::table('catalog_episodes')->update(['air_date_utc' => now()->addYear()->toISOString()]);
        $this->getJson('/api/catalog/feed?view=home')->assertOk()->assertJsonPath('total', 0);
        $db->exec('UPDATE works SET year='.(int) date('Y').", summary=json_remove(summary, '$.airing_timezone') WHERE media='anime'");
        $this->getJson('/api/catalog/feed?view=calendar')->assertOk()->assertJsonPath('total', 0);
    }

    public function test_quarantined_legacy_references_keep_links_but_are_not_discoverable(): void
    {
        $this->index();
        $manifest = json_decode(File::get(config('catalog.manifest')), true);
        $db = new PDO('sqlite:'.$this->directory.'/'.$manifest['generation'].'.sqlite');
        $db->exec("UPDATE works SET summary=json_set(summary, '$.catalog_visibility', 'quarantined') WHERE media='anime'");
        $this->getJson('/api/catalog/search?media=anime')->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/catalog/feed?view=home')->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/catalog/work/1')->assertOk()->assertJsonStructure(['work_id', 'generation', 'url']);
    }

    public function test_catalog_limiter_does_not_write_to_the_application_database(): void
    {
        $this->index();
        config(['cache.default' => 'database', 'database.default' => 'unavailable']);
        try {
            $this->getJson('/api/catalog/search?media=anime')->assertOk()->assertJsonPath('total', 1);
        } finally {
            config(['database.default' => 'sqlite']);
        }
    }

    public function test_no_generation_reports_unavailable_without_using_the_legacy_catalog(): void
    {
        $this->getJson('/api/catalog/search')->assertStatus(503)->assertJsonPath('error', 'catalog_search_unavailable');
    }

    public function test_guest_can_search_each_media_and_legacy_numeric_namespaces_are_not_required(): void
    {
        $this->index();
        $this->getJson('/api/catalog/search?q=Sword&media=all')->assertOk()->assertJsonPath('total', 2)->assertJsonCount(2, 'items');
        $this->getJson('/api/catalog/search?q=Sword&media=novel')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('items.0.title', 'Sword Art Online Novel');
        $this->getJson('/api/catalog/search?q=acao&media=manga')->assertOk()->assertJsonPath('items.0.title', 'Ação');
        $this->getJson('/api/catalog/search?media=all&adult=1')->assertOk()->assertJsonPath('total', 3);
    }

    public function test_invalid_parameters_and_search_operators_cannot_change_the_query(): void
    {
        $this->index();
        $this->getJson('/api/catalog/search?media=../../private')->assertUnprocessable();
        $this->getJson('/api/catalog/search?page=0')->assertUnprocessable();
        $this->getJson('/api/catalog/search?q='.urlencode('" OR *; DROP TABLE works; --'))->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/catalog/search?media=all&page=2')->assertOk()->assertJsonCount(0, 'items');
    }

    public function test_work_lookup_resolves_a_small_descriptor_and_preview_is_unavailable_outside_local(): void
    {
        $this->index();
        $this->getJson('/api/catalog/work/1')->assertOk()->assertJsonStructure(['generation', 'work_id', 'url']);
        $this->getJson('/api/catalog/work/../../private')->assertNotFound();
        $this->getJson('/api/catalog/candidate/manifest')->assertNotFound();
        $this->getJson('/api/catalog/candidate/search')->assertNotFound();
    }

    private function filteredIndex(): void
    {
        $this->index();
        $manifest = json_decode(File::get(config('catalog.manifest')), true);
        $db = new PDO('sqlite:'.$this->directory.'/'.$manifest['generation'].'.sqlite');
        $db->exec("UPDATE works SET summary=json_set(summary, '$.format','TV', '$.genres_json','[\"Action\"]', '$.popularity',12) WHERE media='anime'");
        foreach ([['Alpha', 'COMPLETED', 'MOVIE', '["Action"]', 2, 7, 2020, 0],
            ['Beta', 'NOT_YET_RELEASED', 'TV', '["Drama"]', null, 9, 2028, 0],
            ['Unknown', null, 'MUSIC', 'invalid-json', 0, 6, null, 0],
            ['Adult only', 'COMPLETED', 'OVA', '["RestrictedGenre"]', 1, 10, 2027, 1]] as [$title, $status, $format, $genres, $popularity, $score, $year, $adult]) {
            $id = (string) Str::uuid();
            $summary = json_encode(['work_id' => $id, 'entity_type' => 'WORK', 'title' => $title,
                'status' => $status, 'format' => $format, 'genres_json' => $genres, 'popularity' => $popularity]);
            $db->prepare('INSERT INTO works VALUES(?,?,?,?,?,?,?)')->execute([$id, 'anime', $score, $year, $adult, $summary, '/unused']);
            $db->prepare('INSERT INTO search VALUES(?,?)')->execute([$id, $title]);
        }
    }

    public function test_guest_can_combine_filters_and_unknown_status_is_not_finished(): void
    {
        $this->filteredIndex();
        $this->getJson('/api/catalog/search?status=finished&format=MOVIE&genre=action')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('items.0.title', 'Alpha');
        $this->getJson('/api/catalog/search?status=releasing&format=TV')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('items.0.title', 'Sword Art Online');
        $this->getJson('/api/catalog/search?status=upcoming')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('items.0.title', 'Beta');
        $this->getJson('/api/catalog/search?q=Sword&format=MOVIE')->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/catalog/search?genre='.urlencode("Action' OR 1=1 --"))->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/catalog/search?format='.urlencode("TV' OR 1=1 --"))->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/catalog/search?status=unknown')->assertUnprocessable();
        $this->getJson('/api/catalog/search?sort=score%20DESC')->assertUnprocessable();
    }

    public function test_sorting_uses_real_rank_and_keeps_missing_values_last(): void
    {
        $this->filteredIndex();
        $this->getJson('/api/catalog/search?sort=popularity')->assertOk()->assertJsonPath('items.0.title', 'Alpha')->assertJsonPath('total', 4);
        $this->getJson('/api/catalog/search?sort=score')->assertOk()->assertJsonPath('items.0.title', 'Beta');
        $this->getJson('/api/catalog/search?sort=year')->assertOk()->assertJsonPath('items.0.title', 'Beta')->assertJsonPath('items.3.title', 'Unknown');
        $this->getJson('/api/catalog/search?sort=title')->assertOk()->assertJsonPath('items.0.title', 'Alpha')->assertJsonPath('items.3.title', 'Unknown');
    }

    public function test_facets_keep_visible_scope_without_leaking_adult_data_or_parsing_invalid_genres(): void
    {
        $this->filteredIndex();
        $this->getJson('/api/catalog/search?q=Alpha&status=finished&format=MOVIE&genre=Action&facets=1&adult=1')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('facets.formats', ['MOVIE', 'MUSIC', 'TV'])
            ->assertJsonPath('facets.genres', ['Action', 'Drama'])->assertJsonPath('facets.moreGenres', false);
    }
}
