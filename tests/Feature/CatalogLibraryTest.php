<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\CatalogEpisodeStore;
use App\Support\CatalogGraphImporter;
use App\Support\CatalogIdentityStore;
use App\Support\CatalogLibrary;
use App\Support\CatalogSearch;
use App\Support\EntityContextAliases;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class CatalogLibraryTest extends TestCase
{
    use RefreshDatabase;

    private string $directory;

    private PDO $index;

    protected function setUp(): void
    {
        parent::setUp();
        $this->directory = storage_path('framework/testing/library-'.Str::uuid());
        File::ensureDirectoryExists($this->directory);
        $generation = (string) Str::uuid();
        config(['catalog.manifest' => $this->directory.'/manifest.json', 'catalog.indexes' => $this->directory]);
        File::put(config('catalog.manifest'), json_encode(['schema' => 2, 'generation' => $generation, 'search' => ['schema' => 2, 'generation' => $generation]]));
        $this->index = new PDO('sqlite:'.$this->directory.'/'.$generation.'.sqlite');
        $this->index->exec('CREATE TABLE works(work_id TEXT PRIMARY KEY, adult INTEGER, summary TEXT, media TEXT); CREATE TABLE aliases(reference TEXT PRIMARY KEY, work_id TEXT)');
    }

    protected function tearDown(): void
    {
        unset($this->index);
        File::deleteDirectory($this->directory);
        parent::tearDown();
    }

    private function work(bool $adult = false): string
    {
        $uuid = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work(['work_id' => $uuid, 'media' => 'anime', 'title' => 'No MAL required', 'aliases' => ['work:'.$uuid], 'universe_reference' => $uuid]);
        $this->index->prepare('INSERT INTO works VALUES(?,?,?,?)')->execute([$uuid, (int) $adult, json_encode(['work_id' => $uuid, 'entity_type' => 'WORK', 'title' => 'No MAL required']), 'anime']);
        $this->alias('work:'.$uuid, $uuid);

        return $uuid;
    }

    private function alias(string $reference, string $uuid): void
    {
        $this->index->prepare('INSERT INTO aliases VALUES(?,?)')->execute([$reference, $uuid]);
        app(CatalogIdentityStore::class)->alias('work', $reference, $uuid);
        if (preg_match('/^anime:([1-9]\d*)$/D', $reference, $match)) {
            app(CatalogIdentityStore::class)->alias('work', $match[1], $uuid);
        }
    }

    private function preference(User $user, string $reference, array $changes = []): void
    {
        DB::table('user_entity_preferences')->insert([...['user_id' => $user->id, 'target_type' => 'work', 'target_id' => $reference,
            'bookmarked' => true, 'status' => null, 'user_score' => null, 'created_at' => now(), 'updated_at' => now(), 'last_interacted_at' => now()], ...$changes]);
    }

    public function test_library_requires_authentication_and_never_reads_another_accounts_preferences(): void
    {
        $this->getJson('/api/account/library?view=bookmarks')->assertUnauthorized();
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $uuid = $this->work();
        $this->preference($other, 'work:'.$uuid);
        $this->actingAs($owner)->getJson('/api/account/library?view=bookmarks&user_id='.$other->id)->assertOk()->assertJsonPath('total', 0);
        $this->actingAs($other)->getJson('/api/account/library?view=bookmarks')->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('items.0.work_id', $uuid);
    }

    public function test_uuid_library_survives_later_mal_mapping_and_latest_alias_state_wins(): void
    {
        $user = User::factory()->create();
        $uuid = $this->work();
        $this->preference($user, 'work:work:'.$uuid, ['status' => 'completed', 'user_score' => 8, 'last_interacted_at' => '2026-10-01 00:00:00']);
        $this->actingAs($user)->getJson('/api/account/library?view=bookmarks')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('items.0.work_id', $uuid);
        $this->alias('anime:20', $uuid);
        $this->preference($user, 'work:20', ['bookmarked' => false, 'status' => 'watching', 'last_interacted_at' => '2026-10-22 00:00:00']);
        $this->getJson('/api/account/library?view=bookmarks')->assertOk()->assertJsonPath('total', 0);
        $this->getJson('/api/account/library?view=history')->assertOk()->assertJsonPath('total', 0);
        $this->assertDatabaseCount('user_entity_preferences', 2);
    }

    public function test_pages_adult_preference_and_pending_references_are_preserved(): void
    {
        $user = User::factory()->create(['adult_content_enabled' => false]);
        for ($i = 0; $i < 25; $i++) {
            $this->preference($user, 'work:'.$this->work());
        }
        $this->preference($user, 'work:'.$this->work(true));
        $this->preference($user, 'work:99999999');
        $this->actingAs($user)->getJson('/api/account/library?view=bookmarks')->assertOk()->assertJsonPath('total', 25)->assertJsonCount(24, 'items')->assertJsonPath('unresolved', 2);
        $this->getJson('/api/account/library?view=bookmarks&adult=1')->assertOk()->assertJsonPath('total', 25);
        $this->getJson('/api/account/library?view=bookmarks&page=2')->assertOk()->assertJsonCount(1, 'items');
        $user->update(['adult_content_enabled' => true]);
        $this->getJson('/api/account/library?view=bookmarks')->assertOk()->assertJsonPath('total', 25);
        $this->getJson('/api/account/library?view=bookmarks&adult=1')->assertOk()->assertJsonPath('total', 26);
        $this->assertDatabaseCount('user_entity_preferences', 27);
        $this->getJson('/api/account/library?view=invalid')->assertUnprocessable();
    }

    public function test_reference_contract_does_not_guess_uuid_suffixes_or_cross_media(): void
    {
        $uuid = '314f8bc9-7335-469c-9e42-4227242db37b';
        $this->assertSame('work:'.$uuid, CatalogLibrary::reference('work:work:'.$uuid));
        $this->assertSame('manga:20', CatalogLibrary::reference('work:manga:20'));
        $this->assertSame('work:'.$uuid, CatalogLibrary::reference($uuid));
        foreach (['work:work:20', 'episode:20:ep-1', 'garbage123'] as $invalid) {
            $this->assertNull(CatalogLibrary::reference($invalid));
        }
    }

    public function test_alias_batches_cross_the_sql_parameter_boundary_without_dropping_references(): void
    {
        $references = [];
        for ($i = 0; $i < 253; $i++) {
            $references[] = 'work:'.$this->work();
        }
        $result = app(CatalogSearch::class)->summaries($references, false);
        $this->assertCount(253, $result['resolved']);
        $this->assertArrayHasKey($references[252], $result['resolved']);
    }

    public function test_social_reads_keep_legacy_comments_and_own_progress_without_crossing_media(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $uuid = $this->work();
        $this->alias('anime:20', $uuid);
        foreach (['work:20', 'work:work:'.$uuid, 'work:manga:20'] as $reference) {
            DB::table('entity_discussions')->insert(['user_id' => $owner->id, 'target_type' => 'work', 'target_id' => $reference,
                'comment_body' => $reference, 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->preference($owner, 'work:20');
        $this->preference($owner, 'work:work:'.$uuid);
        $this->preference($other, 'work:20');
        $path = '/api/entity/comments/work/'.urlencode('work:'.$uuid);
        $this->getJson($path)->assertOk()->assertJsonCount(2, 'comments');
        $this->actingAs($owner)->getJson('/api/entity/preferences?target_type=work&target_id='.urlencode('work:'.$uuid))
            ->assertOk()->assertJsonCount(2, 'preferences');
        $this->assertDatabaseCount('entity_discussions', 3);
        $this->assertDatabaseCount('user_entity_preferences', 3);
    }

    public function test_episode_aliases_preserve_local_number_and_leave_unverified_arc_indices_separate(): void
    {
        $uuid = $this->work();
        $this->alias('anime:20', $uuid);
        app(CatalogEpisodeStore::class)->put($uuid, 3, ['work:'.$uuid.':ep-3', 'episode:20:ep-3']);
        $aliases = app(EntityContextAliases::class)->for('episode', 'episode:work:'.$uuid.':ep-3', false);
        $this->assertContains('episode:20:ep-3', $aliases);
        $this->assertNotContains('episode:20:ep-4', $aliases);
        $this->assertNotContains('episode:manga:20:ep-3', $aliases);
        $this->assertSame(['arc:20:arc-1'], app(EntityContextAliases::class)->for('arc', 'arc:20:arc-1', false));
    }

    public function test_tier_one_can_save_read_and_remove_catalog_interactions(): void
    {
        $user = User::factory()->create(['tier' => 1]);
        $uuid = $this->work();
        $target = ['target_type' => 'work', 'target_id' => 'work:'.$uuid];
        $this->actingAs($user)->postJson('/api/entity/preference', [...$target,
            'bookmarked' => true, 'liked' => true, 'user_score' => 8, 'status' => 'watching', 'progress_seconds' => 120,
        ])->assertOk();
        $this->getJson('/api/entity/preferences?'.http_build_query($target))->assertOk()
            ->assertJsonPath('preferences.0.bookmarked', 1)->assertJsonPath('preferences.0.liked', 1)
            ->assertJsonPath('preferences.0.progress_seconds', 120);
        $this->getJson('/api/account/library?view=bookmarks')->assertOk()->assertJsonCount(1, 'items');
        $this->postJson('/api/entity/preference', [...$target, 'bookmarked' => false, 'liked' => false, 'user_score' => null])->assertOk();
        $this->getJson('/api/account/library?view=bookmarks')->assertOk()->assertJsonCount(0, 'items');
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $user->id, 'bookmarked' => false,
            'liked' => false, 'user_score' => null, 'status' => 'watching', 'progress_seconds' => 120]);
    }

    public function test_tier_one_can_post_and_read_a_discussion_with_its_author(): void
    {
        $user = User::factory()->create(['tier' => 1]);
        $uuid = $this->work();
        $this->actingAs($user)->postJson('/api/entity/comments', ['target_type' => 'work', 'target_id' => 'work:'.$uuid,
            'comment_body' => 'Teste local de discussão.', 'contains_spoilers' => true,
        ])->assertCreated()->assertJsonPath('comment.user_name', $user->name);
        $this->getJson('/api/entity/comments/work/'.urlencode('work:'.$uuid))->assertOk()
            ->assertJsonCount(1, 'comments')->assertJsonPath('comments.0.comment_body', 'Teste local de discussão.');
        $this->postJson('/api/entity/comments', ['target_type' => 'work', 'target_id' => 'work:'.$uuid, 'comment_body' => '   '])
            ->assertUnprocessable();
        $this->assertDatabaseCount('entity_discussions', 1);
    }

    public function test_preference_writes_reuse_the_existing_alias_record_and_keep_unmodified_fields(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $uuid = $this->work();
        $this->alias('anime:20', $uuid);
        $this->preference($user, 'work:20', ['status' => 'completed', 'user_score' => 8]);
        $this->preference($other, 'work:20');
        $this->actingAs($user)->postJson('/api/entity/preference', ['target_type' => 'work', 'target_id' => 'work:work:'.$uuid, 'bookmarked' => false])
            ->assertOk()->assertJsonPath('preference.target_id', $uuid)->assertJsonPath('preference.status', 'completed');
        $this->assertDatabaseCount('user_entity_preferences', 2);
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $user->id, 'target_id' => $uuid, 'bookmarked' => false, 'user_score' => 8]);
        $this->assertDatabaseHas('user_entity_preferences', ['user_id' => $other->id, 'bookmarked' => true]);
    }
}
