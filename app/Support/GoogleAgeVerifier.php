<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class GoogleAgeVerifier
{
    private const string BIRTHDAY_SCOPE = 'https://www.googleapis.com/auth/user.birthday.read';

    /** @var array<string, int> */
    private const array AGE_RANGE_ESTIMATES = [
        'TWENTY_ONE_OR_OLDER' => 21,
        'EIGHTEEN_TO_TWENTY' => 18,
        'LESS_THAN_EIGHTEEN' => 17,
    ];

    public function verifyAccessToken(string $accessToken, string $expectedClientId, string $expectedSub): bool
    {
        if ($accessToken === '' || $expectedClientId === '' || $expectedSub === '') {
            return false;
        }

        try {
            $response = Http::timeout(8)->get('https://oauth2.googleapis.com/tokeninfo', [
                'access_token' => $accessToken,
            ]);
        } catch (ConnectionException) {
            return false;
        }

        $payload = $response->json();
        if (! $response->successful() || ! is_array($payload)) {
            return false;
        }

        $audience = (string) ($payload['aud'] ?? $payload['azp'] ?? '');
        $subject = (string) ($payload['sub'] ?? '');
        $expiresIn = (int) ($payload['expires_in'] ?? 0);
        $scopes = preg_split('/\s+/', trim((string) ($payload['scope'] ?? ''))) ?: [];

        if (! hash_equals($expectedClientId, $audience) || ! hash_equals($expectedSub, $subject) || $expiresIn <= 0) {
            return false;
        }

        return in_array(self::BIRTHDAY_SCOPE, $scopes, true);
    }

    /**
     * @return array{ok: bool, birth_date?: ?string, age?: int, error?: string}
     */
    public function fetchBirthDate(string $accessToken): array
    {
        if ($accessToken === '') {
            return ['ok' => false, 'error' => 'birthday_unavailable'];
        }

        try {
            $response = Http::withToken($accessToken)
                ->timeout(8)
                ->get('https://people.googleapis.com/v1/people/me', [
                    'personFields' => 'birthdays,ageRanges',
                ]);
        } catch (ConnectionException) {
            return ['ok' => false, 'error' => 'google_people_unavailable'];
        }

        if (! $response->successful()) {
            Log::warning('Google People API age verification failed', [
                'status' => $response->status(),
                'reason' => $response->json('error.status') ?? $response->json('error.message'),
                'message' => $response->json('error.message'),
            ]);

            return ['ok' => false, 'error' => 'google_people_unavailable'];
        }

        $birthdays = $response->json('birthdays', []);
        $ageRanges = $response->json('ageRanges', []);

        if (is_array($birthdays)) {
            $dateResult = $this->resolveFullBirthDate($birthdays);
            if ($dateResult !== null) {
                return $dateResult;
            }
        }

        if (is_array($ageRanges)) {
            $estimatedAge = $this->findByMetadataPriority(
                $ageRanges,
                static fn (array $item): ?int => is_string($item['ageRange'] ?? null)
                    ? (self::AGE_RANGE_ESTIMATES[$item['ageRange']] ?? null)
                    : null,
            );
            if ($estimatedAge !== null) {
                return [
                    'ok' => true,
                    'birth_date' => null,
                    'age' => $estimatedAge,
                ];
            }
        }

        Log::info('Google People API returned no usable birthday or ageRange', [
            'birthdays_count' => is_array($birthdays) ? count($birthdays) : 0,
            'age_ranges_count' => is_array($ageRanges) ? count($ageRanges) : 0,
        ]);

        return ['ok' => false, 'error' => 'birthday_unavailable'];
    }

    /**
     * @param  array<int, mixed>  $birthdays
     * @return array{ok: true, birth_date: string, age: int}|null
     */
    private function resolveFullBirthDate(array $birthdays): ?array
    {
        $date = $this->findByMetadataPriority($birthdays, static function (array $item): ?array {
            $date = $item['date'] ?? null;
            if (! is_array($date)) {
                return null;
            }

            $year = $date['year'] ?? null;
            $month = $date['month'] ?? null;
            $day = $date['day'] ?? null;

            return (is_int($year) && is_int($month) && is_int($day)) ? [$year, $month, $day] : null;
        });

        if ($date === null) {
            return null;
        }

        $nowUtc = CarbonImmutable::now('UTC');
        [$year, $month, $day] = $date;
        if ($year < 1900 || $year > $nowUtc->year || ! checkdate($month, $day, $year)) {
            return null;
        }

        $birthDate = CarbonImmutable::createFromDate($year, $month, $day, 'UTC')->startOfDay();
        if ($birthDate->isAfter($nowUtc)) {
            return null;
        }

        return [
            'ok' => true,
            'birth_date' => $birthDate->toDateString(),
            'age' => (int) $birthDate->diffInYears($nowUtc),
        ];
    }

    /**
     * Searches items in metadata priority order (ACCOUNT source -> primary -> any entry).
     *
     * @template T
     *
     * @param  array<int, mixed>  $items
     * @param  callable(array<string, mixed>): ?T  $extractor
     * @return T|null
     */
    private function findByMetadataPriority(array $items, callable $extractor): mixed
    {
        $predicates = [
            static fn (array $item): bool => ($item['metadata']['source']['type'] ?? null) === 'ACCOUNT',
            static fn (array $item): bool => (bool) ($item['metadata']['primary'] ?? false) === true,
            static fn (array $item): bool => true,
        ];

        foreach ($predicates as $predicate) {
            foreach ($items as $item) {
                if (! is_array($item) || ! $predicate($item)) {
                    continue;
                }

                $value = $extractor($item);
                if ($value !== null) {
                    return $value;
                }
            }
        }

        return null;
    }
}
