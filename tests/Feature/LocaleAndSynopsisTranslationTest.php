<?php

namespace Tests\Feature;

use App\Support\CatalogGraphImporter;
use App\Support\LocaleResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class LocaleAndSynopsisTranslationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'catalog.manifest' => storage_path('framework/testing/missing-manifest-'.Str::uuid().'.json'),
        ]);
    }

    public function test_locale_resolver_uses_geo_ip_headers_accept_language_and_cookie_override(): void
    {
        $resolver = app(LocaleResolver::class);

        $countryExpectations = [
            'BR' => 'pt-BR',
            'PT' => 'pt-BR',
            'MX' => 'es-ES',
            'JP' => 'ja-JP',
            'TW' => 'zh-CN',
            'RU' => 'ru-RU',
            'IT' => 'it-IT',
            'FR' => 'fr-FR',
            'DE' => 'de-DE',
            'IN' => 'hi-IN',
            'US' => 'en-US',
            'SE' => 'en-US',
        ];

        foreach ($countryExpectations as $country => $expectedLocale) {
            $req = Request::create('/', 'GET', [], [], [], ['HTTP_CF_IPCOUNTRY' => $country]);
            $this->assertSame($expectedLocale, $resolver->resolveFromRequest($req), "Failed country {$country}");
        }

        // Unknown Cloudflare country (XX) falls back to Accept-Language quality ordering
        $acceptReq = Request::create('/', 'GET', [], [], [], [
            'HTTP_CF_IPCOUNTRY' => 'XX',
            'HTTP_ACCEPT_LANGUAGE' => 'en-US;q=0.5,es-AR;q=0.9,fr;q=0.7',
        ]);
        $this->assertSame('es-ES', $resolver->resolveFromRequest($acceptReq));

        // Explicit cookie overrides Geo-IP header
        $cookieReq = Request::create('/', 'GET', [], ['anirium_lang' => 'ja-JP'], [], [
            'HTTP_CF_IPCOUNTRY' => 'BR',
            'HTTP_ACCEPT_LANGUAGE' => 'pt-BR,pt;q=0.9',
        ]);
        $this->assertSame('ja-JP', $resolver->resolveFromRequest($cookieReq));

        // No hints falls back to en-US
        $bareReq = Request::create('/', 'GET');
        $this->assertSame('en-US', $resolver->resolveFromRequest($bareReq));
    }

    public function test_work_graph_translates_synopsis_on_demand_and_persists_in_sqlite_for_detected_country(): void
    {
        $workId = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work([
            'work_id' => $workId,
            'media' => 'anime',
            'title' => 'Dungeon Explorer',
            'aliases' => ['work:'.$workId],
            'universe_reference' => 'locale-test-'.Str::uuid(),
        ]);

        DB::table('catalog_translations')->insert([
            'entity_id' => $workId,
            'entity_kind' => 'work',
            'field' => 'synopsis',
            'locale' => 'en',
            'value' => 'A young mage explores dungeons.',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            '*/api/generate' => Http::response([
                'response' => 'Um jovem mago explora masmorras.',
            ]),
        ]);

        // First request from Brazil translates on-demand and stores in catalog_translations
        $this->withHeaders(['CF-IPCountry' => 'BR'])
            ->getJson("/api/catalog/graph/work/{$workId}")
            ->assertOk()
            ->assertJsonPath('entity.synopsis', 'Um jovem mago explora masmorras.');

        $this->assertDatabaseHas('catalog_translations', [
            'entity_id' => $workId,
            'entity_kind' => 'work',
            'field' => 'synopsis',
            'locale' => 'pt-BR',
            'value' => 'Um jovem mago explora masmorras.',
        ]);
        Http::assertSentCount(1);

        // Even after flushing cache, second request reads from SQLite with zero external HTTP calls
        Cache::flush();
        $this->withHeaders(['CF-IPCountry' => 'BR'])
            ->getJson("/api/catalog/graph/work/{$workId}")
            ->assertOk()
            ->assertJsonPath('entity.synopsis', 'Um jovem mago explora masmorras.');
        Http::assertSentCount(1);

        // Unencrypted JS cookie (exempted in EncryptCookies) switches locale cleanly
        $this->withCredentials()
            ->withUnencryptedCookie('anirium_lang', 'en-US')
            ->withHeaders(['CF-IPCountry' => 'BR'])
            ->getJson("/api/catalog/graph/work/{$workId}")
            ->assertOk()
            ->assertJsonPath('entity.synopsis', 'A young mage explores dungeons.');
        Http::assertSentCount(1);
    }

    public function test_batch_synopsis_translation_command_is_resumable_and_skips_existing_rows(): void
    {
        $workId = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work([
            'work_id' => $workId,
            'media' => 'anime',
            'title' => 'Crimson Blade',
            'aliases' => ['work:'.$workId],
            'universe_reference' => 'batch-locale-test-'.Str::uuid(),
        ]);

        DB::table('catalog_translations')->insert([
            'entity_id' => $workId,
            'entity_kind' => 'work',
            'field' => 'synopsis',
            'locale' => 'en',
            'value' => 'A warrior travels across kingdoms.',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            '*/api/generate' => Http::response([
                'response' => 'Un guerrero viaja por reinos.',
            ]),
        ]);

        $this->artisan('catalog:translate-synopses', [
            '--locales' => 'es-ES',
            '--limit' => 1,
            '--sleep-ms' => 0,
        ])->assertSuccessful();

        $this->assertDatabaseHas('catalog_translations', [
            'entity_id' => $workId,
            'field' => 'synopsis',
            'locale' => 'es-ES',
            'value' => 'Un guerrero viaja por reinos.',
        ]);
        Http::assertSentCount(1);

        // Second run finds 0 pending rows and sends no HTTP requests
        $this->artisan('catalog:translate-synopses', [
            '--locales' => 'es-ES',
            '--sleep-ms' => 0,
        ])->assertSuccessful();
        Http::assertSentCount(1);
    }

    public function test_translator_scrubs_malformed_utf8_without_throwing_json_exception(): void
    {
        $workId = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work([
            'work_id' => $workId,
            'media' => 'anime',
            'title' => 'Fate CM Anthology',
            'aliases' => ['work:'.$workId],
            'universe_reference' => 'utf8-locale-test-'.Str::uuid(),
        ]);

        DB::table('catalog_translations')->insert([
            'entity_id' => $workId,
            'entity_kind' => 'work',
            'field' => 'synopsis',
            'locale' => 'en',
            'value' => "First commercial \xC3\x28 second commercial",
        ]);

        Http::preventStrayRequests();
        Http::fake([
            '*/api/generate' => Http::response([
                'response' => 'Primeiro comercial e segundo comercial.',
            ]),
        ]);

        $this->artisan('catalog:translate-synopses', [
            '--locales' => 'pt-BR',
            '--limit' => 1,
            '--sleep-ms' => 0,
        ])->assertSuccessful();

        $this->assertDatabaseHas('catalog_translations', [
            'entity_id' => $workId,
            'field' => 'synopsis',
            'locale' => 'pt-BR',
            'value' => 'Primeiro comercial e segundo comercial.',
        ]);
    }
}
