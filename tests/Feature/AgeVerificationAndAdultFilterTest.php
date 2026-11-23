<?php

namespace Tests\Feature;

use App\Models\AgeVerificationRequest;
use App\Models\User;
use App\Support\CatalogGraphImporter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgeVerificationAndAdultFilterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'services.google.client_id' => 'test-google-client.apps.googleusercontent.com',
            'services.google.redirect' => 'https://anirium.com.br',
            'catalog.manifest' => storage_path('framework/testing/missing-manifest-'.Str::uuid().'.json'),
        ]);
    }

    private function createWorkPair(): array
    {
        $universeRef = 'age-test-universe-'.Str::uuid();
        $safeWorkId = (string) Str::uuid();
        $adultWorkId = (string) Str::uuid();

        app(CatalogGraphImporter::class)->work([
            'work_id' => $safeWorkId,
            'media' => 'anime',
            'title' => 'Safe Work',
            'aliases' => ['work:'.$safeWorkId],
            'universe_reference' => $universeRef,
        ]);

        app(CatalogGraphImporter::class)->work([
            'work_id' => $adultWorkId,
            'media' => 'anime',
            'title' => 'Restricted Adult Work',
            'format' => 'HENTAI',
            'aliases' => ['work:'.$adultWorkId],
            'universe_reference' => $universeRef,
        ]);

        DB::table('catalog_works')->where('id', $adultWorkId)->update(['is_adult' => 1]);
        $universeId = (string) DB::table('catalog_universe_works')->where('work_id', $safeWorkId)->value('universe_id');

        $adultOnlyUniverseRef = 'age-adult-only-'.Str::uuid();
        $adultOnlyWorkId = (string) Str::uuid();
        app(CatalogGraphImporter::class)->work([
            'work_id' => $adultOnlyWorkId,
            'media' => 'anime',
            'title' => 'Adult Only Universe Work',
            'format' => 'HENTAI',
            'aliases' => ['work:'.$adultOnlyWorkId],
            'universe_reference' => $adultOnlyUniverseRef,
        ]);
        DB::table('catalog_works')->where('id', $adultOnlyWorkId)->update(['is_adult' => 1]);
        $adultOnlyUniverseId = (string) DB::table('catalog_universe_works')->where('work_id', $adultOnlyWorkId)->value('universe_id');

        return [$safeWorkId, $adultWorkId, $universeId, $adultOnlyUniverseId];
    }

    public function test_unverified_user_cannot_enable_adult_content_or_bypass_with_query_param(): void
    {
        [$safeWorkId, $adultWorkId, $universeId, $adultOnlyUniverseId] = $this->createWorkPair();
        $user = User::factory()->create([
            'adult_content_enabled' => false,
            'age_verification_status' => 'unverified',
        ]);

        // Guest checks
        $this->postJson('/api/account/settings', ['adult_content_enabled' => true])->assertUnauthorized();
        $this->getJson('/api/catalog/adult-shard/work')->assertForbidden();
        $this->getJson("/api/catalog/graph/work/{$adultWorkId}?adult=1")->assertNotFound();
        $this->getJson("/api/catalog/graph/universe/{$adultOnlyUniverseId}?adult=1")->assertNotFound();
        $this->getJson("/api/catalog/graph/universe/{$universeId}?adult=1")
            ->assertOk()
            ->assertJsonPath('work_ids', [$safeWorkId]);

        // Unverified authenticated user checks
        $this->actingAs($user)
            ->postJson('/api/account/settings', ['adult_content_enabled' => true])
            ->assertForbidden()
            ->assertJson([
                'error' => 'age_verification_required',
                'age_verified' => false,
                'adult_content_enabled' => false,
            ]);

        $this->getJson('/api/catalog/adult-shard/work')->assertForbidden();
        $this->getJson("/api/catalog/graph/work/{$adultWorkId}?adult=1")->assertNotFound();
        $this->getJson("/api/catalog/graph/universe/{$adultOnlyUniverseId}?adult=1")->assertNotFound();
        $this->getJson("/api/catalog/graph/universe/{$universeId}?adult=1")
            ->assertOk()
            ->assertJsonPath('work_ids', [$safeWorkId]);
    }

    public function test_google_people_verification_grants_18_plus_and_unlocks_adult_shard_and_graph(): void
    {
        $this->travelTo('2026-11-18 12:00:00');
        [$safeWorkId, $adultWorkId] = $this->createWorkPair();

        $user = User::factory()->create([
            'email' => 'adult.reader@example.com',
            'google_id' => 'sub-adult-18',
            'age_verification_status' => 'unverified',
            'adult_content_enabled' => false,
        ]);

        $this->actingAs($user);
        $redirect = $this->get('/auth/google/verify-age');
        $redirect->assertRedirect();
        $location = (string) $redirect->headers->get('Location');
        $this->assertStringContainsString('user.birthday.read', $location);

        parse_str((string) parse_url($location, PHP_URL_QUERY), $queryParams);
        $state = (string) ($queryParams['state'] ?? '');
        $this->assertStringStartsWith('age_verify:', $state);

        Http::preventStrayRequests();
        Http::fake([
            'https://oauth2.googleapis.com/tokeninfo*' => function (HttpRequest $request) {
                $query = [];
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

                if (($query['id_token'] ?? null) === 'valid-id-token') {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'iss' => 'https://accounts.google.com',
                        'exp' => time() + 3600,
                        'sub' => 'sub-adult-18',
                        'email' => 'adult.reader@example.com',
                        'email_verified' => 'true',
                    ]);
                }

                if (($query['access_token'] ?? null) === 'valid-access-token') {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'sub' => 'sub-adult-18',
                        'expires_in' => 3600,
                        'scope' => 'openid email profile https://www.googleapis.com/auth/user.birthday.read',
                    ]);
                }

                return Http::response(['error' => 'invalid_token'], 400);
            },
            'https://people.googleapis.com/v1/people/me*' => Http::response([
                'birthdays' => [
                    [
                        'metadata' => ['primary' => true, 'source' => ['type' => 'ACCOUNT']],
                        'date' => ['year' => 2000, 'month' => 5, 'day' => 10],
                    ],
                ],
            ]),
        ]);

        $response = $this->postJson('/api/account/age-verification/google', [
            'state' => $state,
            'id_token' => 'valid-id-token',
            'access_token' => 'valid-access-token',
        ]);

        $response->assertOk()
            ->assertJsonPath('age_verified', true)
            ->assertJsonPath('age_verification_status', 'verified')
            ->assertJsonPath('age_verification_method', 'google_people')
            ->assertJsonMissingPath('birth_date');

        $fresh = $user->fresh();
        $this->assertNotNull($fresh);
        $this->assertSame('2000-05-10', $fresh->birth_date);
        $rawEncrypted = DB::table('users')->where('id', $user->id)->value('birth_date');
        $this->assertNotSame('2000-05-10', $rawEncrypted);

        $this->postJson('/api/account/settings', ['adult_content_enabled' => true])
            ->assertOk()
            ->assertJsonPath('adult_content_enabled', true)
            ->assertJsonPath('age_verified', true);

        $shardResponse = $this->getJson('/api/catalog/adult-shard/work')->assertOk();
        $shardIds = array_column($shardResponse->json(), 'id');
        $this->assertContains($adultWorkId, $shardIds);
        $this->assertNotContains($safeWorkId, $shardIds);

        $this->getJson("/api/catalog/graph/work/{$adultWorkId}")
            ->assertOk()
            ->assertJsonPath('entity.id', $adultWorkId);
    }

    public function test_google_people_verification_blocks_underage_and_rejects_mismatched_tokens_or_state(): void
    {
        $this->travelTo('2026-11-18 12:00:00');
        $user = User::factory()->create([
            'email' => 'teen.user@example.com',
            'google_id' => 'sub-teen-17',
            'adult_content_enabled' => true,
            'age_verification_status' => 'unverified',
        ]);

        $this->actingAs($user);
        $this->get('/auth/google/verify-age')->assertRedirect();
        $state = 'age_verify:'.session('google_age_verify_state');

        // Wrong OAuth state
        $this->postJson('/api/account/age-verification/google', [
            'state' => 'age_verify:wrong-state',
            'id_token' => 'id-tok',
            'access_token' => 'acc-tok',
        ])->assertForbidden()->assertJsonPath('error', 'invalid_oauth_state');

        Http::preventStrayRequests();
        Http::fake([
            'https://oauth2.googleapis.com/tokeninfo*' => function (HttpRequest $request) {
                $query = [];
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
                if (($query['id_token'] ?? null) === 'other-user-id') {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'iss' => 'https://accounts.google.com',
                        'exp' => time() + 3600,
                        'sub' => 'sub-someone-else',
                        'email' => 'other@example.com',
                        'email_verified' => 'true',
                    ]);
                }
                if (($query['id_token'] ?? null) === 'teen-id-tok') {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'iss' => 'https://accounts.google.com',
                        'exp' => time() + 3600,
                        'sub' => 'sub-teen-17',
                        'email' => 'teen.user@example.com',
                        'email_verified' => 'true',
                    ]);
                }
                if (($query['access_token'] ?? null) === 'mismatch-sub-access') {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'sub' => 'sub-attacker',
                        'expires_in' => 3600,
                        'scope' => 'openid https://www.googleapis.com/auth/user.birthday.read',
                    ]);
                }
                if (($query['access_token'] ?? null) === 'teen-access-tok') {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'sub' => 'sub-teen-17',
                        'expires_in' => 3600,
                        'scope' => 'openid https://www.googleapis.com/auth/user.birthday.read',
                    ]);
                }

                return Http::response([], 400);
            },
            'https://people.googleapis.com/v1/people/me*' => Http::response([
                'birthdays' => [
                    [
                        'metadata' => ['source' => ['type' => 'ACCOUNT']],
                        'date' => ['year' => 2009, 'month' => 5, 'day' => 1],
                    ],
                ],
            ]),
        ]);

        // Account mismatch on id_token
        $this->get('/auth/google/verify-age');
        $state2 = 'age_verify:'.session('google_age_verify_state');
        $this->postJson('/api/account/age-verification/google', [
            'state' => $state2,
            'id_token' => 'other-user-id',
            'access_token' => 'teen-access-tok',
        ])->assertForbidden()->assertJsonPath('error', 'google_account_mismatch');

        // Subject mismatch on access_token
        $this->get('/auth/google/verify-age');
        $state3 = 'age_verify:'.session('google_age_verify_state');
        $this->postJson('/api/account/age-verification/google', [
            'state' => $state3,
            'id_token' => 'teen-id-tok',
            'access_token' => 'mismatch-sub-access',
        ])->assertForbidden()->assertJsonPath('error', 'invalid_access_token');

        // Underage lock
        $this->get('/auth/google/verify-age');
        $state4 = 'age_verify:'.session('google_age_verify_state');
        $this->postJson('/api/account/age-verification/google', [
            'state' => $state4,
            'id_token' => 'teen-id-tok',
            'access_token' => 'teen-access-tok',
        ])->assertForbidden()
            ->assertJson([
                'status' => 'underage',
                'error' => 'minimum_age_not_met',
                'minimum_age' => 18,
            ]);

        $fresh = $user->fresh();
        $this->assertNotNull($fresh);
        $this->assertSame('underage', $fresh->age_verification_status);
        $this->assertFalse((bool) $fresh->adult_content_enabled);

        // Underage user cannot submit manual request afterward
        $this->postJson('/api/account/age-verification/request', [
            'birth_date' => '1990-01-01',
            'declaration_accepted' => true,
        ])->assertForbidden()->assertJsonPath('error', 'underage_blocked');
    }

    public function test_google_people_missing_birthday_returns_422_for_admin_fallback(): void
    {
        $user = User::factory()->create([
            'email' => 'noyear@example.com',
            'google_id' => 'sub-noyear',
        ]);
        $this->actingAs($user);
        $this->get('/auth/google/verify-age');
        $state = 'age_verify:'.session('google_age_verify_state');

        Http::preventStrayRequests();
        Http::fake([
            'https://oauth2.googleapis.com/tokeninfo*' => function (HttpRequest $request) {
                $query = [];
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
                if (isset($query['id_token'])) {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'iss' => 'https://accounts.google.com',
                        'exp' => time() + 3600,
                        'sub' => 'sub-noyear',
                        'email' => 'noyear@example.com',
                        'email_verified' => 'true',
                    ]);
                }

                return Http::response([
                    'aud' => 'test-google-client.apps.googleusercontent.com',
                    'sub' => 'sub-noyear',
                    'expires_in' => 3600,
                    'scope' => 'openid https://www.googleapis.com/auth/user.birthday.read',
                ]);
            },
            'https://people.googleapis.com/v1/people/me*' => Http::response([
                'birthdays' => [
                    [
                        'metadata' => ['source' => ['type' => 'ACCOUNT']],
                        'date' => ['month' => 5, 'day' => 10],
                    ],
                ],
            ]),
        ]);

        $this->postJson('/api/account/age-verification/google', [
            'state' => $state,
            'id_token' => 'id-tok',
            'access_token' => 'acc-tok',
        ])->assertStatus(422)
            ->assertJson([
                'status' => 'unverified',
                'error' => 'birthday_unavailable',
                'fallback_available' => true,
            ]);

        $this->assertSame('unverified', $user->fresh()?->age_verification_status);
    }

    public function test_manual_request_saves_immutable_birth_date_once_and_admin_controls_work(): void
    {
        $this->travelTo('2026-11-18 12:00:00');
        [, $adultWorkId] = $this->createWorkPair();

        $underageRequester = User::factory()->create();
        $this->actingAs($underageRequester)
            ->postJson('/api/account/age-verification/request', [
                'birth_date' => '2012-01-01',
                'declaration_accepted' => true,
            ])
            ->assertForbidden()
            ->assertJsonPath('status', 'underage');
        $this->assertSame('underage', $underageRequester->fresh()?->age_verification_status);

        // Underage lock cannot be bypassed with another date
        $this->actingAs($underageRequester)
            ->postJson('/api/account/age-verification/request', [
                'birth_date' => '1990-01-01',
                'declaration_accepted' => true,
            ])
            ->assertForbidden()
            ->assertJsonPath('error', 'underage_blocked');

        $member = User::factory()->create(['tier' => 1]);
        $admin = User::factory()->create(['email' => 'santoss.cog@gmail.com', 'tier' => 3]);
        $otherUser = User::factory()->create(['tier' => 2]);

        $this->actingAs($member)
            ->postJson('/api/account/age-verification/request', [
                'birth_date' => '1998-04-20',
                'declaration_accepted' => true,
            ])
            ->assertOk()
            ->assertJsonPath('age_verification_status', 'verified')
            ->assertJsonPath('age_verified', true)
            ->assertJsonPath('age_verification_method', 'manual_immutable');

        $memberFresh = $member->fresh();
        $this->assertNotNull($memberFresh);
        $this->assertTrue($memberFresh->isAgeVerified());
        $this->assertSame('manual_immutable', $memberFresh->age_verification_method);
        $this->assertSame('1998-04-20', $memberFresh->birth_date);

        // Birth date can only be saved once and never changes afterward
        $this->actingAs($memberFresh)
            ->postJson('/api/account/age-verification/request', [
                'birth_date' => '2012-01-01',
                'declaration_accepted' => true,
            ])
            ->assertStatus(409)
            ->assertJsonPath('error', 'birth_date_locked');
        $this->assertSame('1998-04-20', $member->fresh()?->birth_date);

        // Verified user enables toggle and fetches adult shard
        $this->actingAs($memberFresh)
            ->postJson('/api/account/settings', ['adult_content_enabled' => true])
            ->assertOk()
            ->assertJsonPath('adult_content_enabled', true);

        $this->getJson('/api/catalog/adult-shard/work')
            ->assertOk()
            ->assertJsonFragment(['id' => $adultWorkId]);

        // Admin queue & revoke remain protected and operational
        $legacyMember = User::factory()->create(['tier' => 1]);
        $req = AgeVerificationRequest::create([
            'user_id' => $legacyMember->id,
            'status' => 'pending',
            'declared_birth_date' => '1997-02-14',
            'declaration_accepted_at' => now(),
        ]);

        $this->actingAs($otherUser)->getJson('/api/admin/age-verifications')->assertForbidden();
        $this->actingAs($otherUser)->postJson("/api/admin/age-verifications/{$req->id}/approve")->assertForbidden();

        $this->actingAs($admin)
            ->getJson('/api/admin/age-verifications')
            ->assertOk()
            ->assertJsonPath('pending.0.id', $req->id)
            ->assertJsonPath('pending.0.declared_birth_date', '1997-02-14');

        $this->actingAs($admin)
            ->postJson("/api/admin/age-verifications/{$req->id}/approve", ['review_note' => 'Aprovado no painel'])
            ->assertOk()
            ->assertJsonPath('status', 'approved');

        $this->actingAs($admin)
            ->postJson("/api/admin/age-verifications/users/{$member->id}/revoke", ['review_note' => 'Revogado'])
            ->assertOk()
            ->assertJsonPath('adult_content_enabled', false);

        $revokedMember = $member->fresh();
        $this->assertNotNull($revokedMember);
        $this->assertFalse($revokedMember->isAgeVerified());
        $this->assertFalse((bool) $revokedMember->adult_content_enabled);

        $this->actingAs($revokedMember)->getJson('/api/catalog/adult-shard/work')->assertForbidden();
    }

    public function test_admin_can_reject_manual_request_with_note(): void
    {
        $this->travelTo('2026-11-18 12:00:00');
        $member = User::factory()->create(['tier' => 1]);
        $admin = User::factory()->create(['email' => 'santoss.cog@gmail.com', 'tier' => 3]);

        $req = AgeVerificationRequest::create([
            'user_id' => $member->id,
            'status' => 'pending',
            'declared_birth_date' => '1999-03-15',
            'declaration_accepted_at' => now(),
        ]);

        $this->actingAs($admin)
            ->postJson("/api/admin/age-verifications/{$req->id}/reject", ['review_note' => 'Dados inconsistentes'])
            ->assertOk()
            ->assertJsonPath('status', 'rejected');

        $memberFresh = $member->fresh();
        $this->assertNotNull($memberFresh);
        $this->assertSame('rejected', $memberFresh->age_verification_status);
        $this->assertFalse($memberFresh->isAgeVerified());
        $this->assertSame('Dados inconsistentes', $memberFresh->age_verification_note);

        $this->actingAs($memberFresh)
            ->getJson('/api/account/age-verification/status')
            ->assertOk()
            ->assertJsonPath('age_verification_status', 'rejected')
            ->assertJsonPath('last_rejection_note', 'Dados inconsistentes');
    }

    public function test_google_people_age_ranges_verifies_adult_when_birth_year_is_omitted(): void
    {
        $user = User::factory()->create([
            'email' => 'agerange.adult@example.com',
            'google_id' => 'sub-range-adult',
        ]);
        $this->actingAs($user);
        $this->get('/auth/google/verify-age');
        $state = 'age_verify:'.session('google_age_verify_state');

        $this->fakeGoogleAgeResponses('agerange.adult@example.com', 'sub-range-adult', [
            'birthdays' => [
                [
                    'metadata' => ['source' => ['type' => 'ACCOUNT']],
                    'date' => ['month' => 5, 'day' => 10],
                ],
            ],
            'ageRanges' => [
                [
                    'metadata' => ['source' => ['type' => 'ACCOUNT'], 'primary' => true],
                    'ageRange' => 'TWENTY_ONE_OR_OLDER',
                ],
            ],
        ]);

        $this->postJson('/api/account/age-verification/google', [
            'state' => $state,
            'id_token' => 'id-tok',
            'access_token' => 'acc-tok',
        ])->assertOk()
            ->assertJsonPath('age_verification_status', 'verified')
            ->assertJsonPath('age_verified', true);

        $fresh = $user->fresh();
        $this->assertNotNull($fresh);
        $this->assertTrue($fresh->isAgeVerified());
        $this->assertSame('google_people', $fresh->age_verification_method);
    }

    public function test_google_people_age_ranges_blocks_underage_when_birthday_is_empty(): void
    {
        $user = User::factory()->create([
            'email' => 'agerange.minor@example.com',
            'google_id' => 'sub-range-minor',
            'adult_content_enabled' => true,
        ]);
        $this->actingAs($user);
        $this->get('/auth/google/verify-age');
        $state = 'age_verify:'.session('google_age_verify_state');

        $this->fakeGoogleAgeResponses('agerange.minor@example.com', 'sub-range-minor', [
            'ageRanges' => [
                [
                    'metadata' => ['source' => ['type' => 'ACCOUNT'], 'primary' => true],
                    'ageRange' => 'LESS_THAN_EIGHTEEN',
                ],
            ],
        ]);

        $this->postJson('/api/account/age-verification/google', [
            'state' => $state,
            'id_token' => 'id-tok',
            'access_token' => 'acc-tok',
        ])->assertForbidden()
            ->assertJson([
                'status' => 'underage',
                'error' => 'minimum_age_not_met',
                'minimum_age' => User::MINIMUM_ADULT_AGE,
            ]);

        $fresh = $user->fresh();
        $this->assertNotNull($fresh);
        $this->assertSame('underage', $fresh->age_verification_status);
        $this->assertFalse((bool) $fresh->adult_content_enabled);
    }

    /**
     * @param  array<string, mixed>  $peoplePayload
     */
    private function fakeGoogleAgeResponses(string $email, string $sub, array $peoplePayload): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://oauth2.googleapis.com/tokeninfo*' => function (HttpRequest $request) use ($email, $sub) {
                $query = [];
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
                if (isset($query['id_token'])) {
                    return Http::response([
                        'aud' => 'test-google-client.apps.googleusercontent.com',
                        'iss' => 'https://accounts.google.com',
                        'exp' => time() + 3600,
                        'sub' => $sub,
                        'email' => $email,
                        'email_verified' => 'true',
                    ]);
                }

                return Http::response([
                    'aud' => 'test-google-client.apps.googleusercontent.com',
                    'sub' => $sub,
                    'expires_in' => 3600,
                    'scope' => 'openid https://www.googleapis.com/auth/user.birthday.read',
                ]);
            },
            'https://people.googleapis.com/v1/people/me*' => Http::response($peoplePayload),
        ]);
    }
}
