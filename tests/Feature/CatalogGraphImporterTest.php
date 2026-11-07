<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogGraphImporterTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_preserves_sparse_episodes_and_identities_across_repeated_enrichment(): void
    {
        $work = (string) Str::uuid();
        $record = [
            'work_id' => $work, 'media' => 'anime', 'title' => 'Documented anime',
            'aliases' => ['work:'.$work], 'universe_reference' => $work,
            'references' => [['provider' => 'kitsu', 'media' => 'anime', 'id' => '700']],
            'episode_count' => 24, 'titles' => ['en' => 'Documented anime'],
            'episodes' => [
                ['number' => 1, 'tvdb_season' => 2, 'tvdb_episode_id' => 123, 'titles' => ['en' => 'First']],
                ['number' => 3, 'tvdb_season' => 2, 'titles' => ['pt-BR' => 'Terceiro']],
            ],
            'arcs' => [['arcId' => 'source-arc', 'name' => 'Verified arc', 'startEp' => 1, 'endEp' => 3, 'source_url' => 'https://example.org/arc']],
        ];
        $importer = app(CatalogGraphImporter::class);
        $this->assertSame($work, $importer->work($record));
        $episodeIds = DB::table('catalog_episodes')->orderBy('number')->pluck('id')->all();
        $universe = DB::table('catalog_universes')->value('id');
        $user = User::factory()->create();
        DB::table('user_entity_preferences')->insert(['user_id' => $user->id, 'target_type' => 'episode', 'target_id' => $episodeIds[0], 'entity_id' => $episodeIds[0], 'progress_seconds' => 87]);
        $this->assertDatabaseMissing('catalog_external_identities', ['provider' => 'mal']);
        $record['references'][] = ['provider' => 'mal', 'media' => 'anime', 'id' => '100'];
        $record['aliases'][] = 'anime:100';
        $importer->work($record);

        $this->assertSame($episodeIds, DB::table('catalog_episodes')->orderBy('number')->pluck('id')->all());
        $this->assertNotSame($work, $universe);
        $this->assertDatabaseCount('catalog_works', 1);
        $this->assertDatabaseCount('catalog_universes', 1);
        $this->assertDatabaseCount('catalog_seasons', 1);
        $this->assertDatabaseCount('catalog_episodes', 2);
        $this->assertDatabaseCount('catalog_arc_episodes', 2);
        $this->assertDatabaseHas('catalog_external_identities', ['provider' => 'mal', 'namespace' => 'anime:work', 'external_id' => '100', 'entity_id' => $work]);
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $user->id, 'entity_id' => $episodeIds[0], 'progress_seconds' => 87]);
    }

    public function test_literal_zero_is_a_title_and_only_blank_titles_are_rejected(): void
    {
        $record = ['work_id' => (string) Str::uuid(), 'media' => 'manga', 'title' => '0',
            'aliases' => ['work:'.Str::uuid()], 'universe_reference' => (string) Str::uuid()];
        app(CatalogGraphImporter::class)->work($record);
        $this->assertDatabaseHas('catalog_works', ['id' => $record['work_id'], 'title' => '0']);
        $this->expectException(\DomainException::class);
        app(CatalogGraphImporter::class)->work([...$record, 'title' => '   ']);
    }

    public function test_anime_and_manga_share_a_universe_without_sharing_their_identity(): void
    {
        $importer = app(CatalogGraphImporter::class);
        $anime = (string) Str::uuid();
        $manga = (string) Str::uuid();
        foreach (['anime' => $anime, 'manga' => $manga] as $media => $id) {
            $importer->work(['work_id' => $id, 'media' => $media, 'title' => 'Shared title', 'aliases' => [$media.':21'], 'universe_reference' => $anime, 'references' => [['provider' => 'mal', 'media' => $media, 'id' => '21']]]);
        }
        $this->assertSame(0, $importer->relations(['work_id' => $anime, 'relations' => [['target_work_id' => $manga, 'relation_type' => 'adaptation', 'source' => 'mal']]]));
        $this->assertDatabaseCount('catalog_works', 2);
        $this->assertDatabaseCount('catalog_universes', 1);
        $this->assertDatabaseCount('catalog_universe_works', 2);
        $this->assertDatabaseHas('catalog_work_relations', ['from_work_id' => $anime, 'to_work_id' => $manga, 'relation_type' => 'adaptation']);
    }

    public function test_import_does_not_silently_change_the_media_of_an_existing_work(): void
    {
        $record = ['work_id' => (string) Str::uuid(), 'media' => 'anime', 'title' => 'Original', 'aliases' => ['anime:21'], 'universe_reference' => (string) Str::uuid()];
        $importer = app(CatalogGraphImporter::class);
        $importer->work($record);
        try {
            $importer->work([...$record, 'media' => 'manga']);
            $this->fail('Cross-media reassignment was accepted');
        } catch (\DomainException) {
            $this->assertDatabaseHas('catalog_works', ['id' => $record['work_id'], 'media' => 'anime']);
        }
    }

    public function test_a_shared_provider_episode_reference_does_not_merge_different_works(): void
    {
        $importer = app(CatalogGraphImporter::class);
        $first = (string) Str::uuid();
        $second = (string) Str::uuid();
        foreach ([$first, $second] as $work) {
            $importer->work(['work_id' => $work, 'media' => 'anime', 'title' => 'Separate work', 'aliases' => ['work:'.$work], 'universe_reference' => $first,
                'episodes' => [['number' => 1, 'tvdb_episode_id' => 82962, 'titles' => []]]]);
        }
        $original = DB::table('catalog_episodes')->where('work_id', $first)->value('id');
        app(CatalogEpisodeStore::class)->put($first, 49, ['work:'.$first.':ep-49'], ['tvdb', 'anime:episode:work:'.$first, '82962']);
        $this->assertDatabaseCount('catalog_episodes', 2);
        $this->assertDatabaseHas('catalog_episodes', ['id' => $original, 'work_id' => $first, 'number' => 49]);
        $this->assertDatabaseHas('catalog_episodes', ['work_id' => $second, 'number' => 1]);
        $this->assertSame(2, DB::table('catalog_external_identities')->where('provider', 'tvdb')->where('external_id', '82962')->count());
    }
}
