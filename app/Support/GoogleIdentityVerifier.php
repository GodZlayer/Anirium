<?php

namespace App\Support;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class GoogleIdentityVerifier
{
    private const CERTS_CACHE_KEY = 'google_oauth_x509_certs';

    private const CERTS_TTL_SECONDS = 21600;

    public function verify(string $token, string $clientId): ?array
    {
        $localPayload = $this->verifyLocally($token, $clientId);
        if ($localPayload !== null) {
            return $localPayload;
        }

        try {
            $response = Http::connectTimeout(3)->timeout(8)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $token]);
        } catch (ConnectionException) {
            return null;
        }
        $payload = $response->json();
        if (! $response->successful() || ! is_array($payload) || ! $this->hasValidClaims($payload, $clientId)) {
            return null;
        }

        return $payload;
    }

    private function verifyLocally(string $token, string $clientId): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        $header = $this->decodeJwtSegment($parts[0]);
        $payload = $this->decodeJwtSegment($parts[1]);
        $rawSignature = $this->base64UrlDecode($parts[2]);
        if ($header === null || $payload === null || $rawSignature === null) {
            return null;
        }

        $kid = $header['kid'] ?? '';
        if (($header['alg'] ?? null) !== 'RS256' || ! is_string($kid) || $kid === '') {
            return null;
        }

        if (! $this->hasValidClaims($payload, $clientId)) {
            return null;
        }

        $certs = Cache::get(self::CERTS_CACHE_KEY);
        if (! is_array($certs) || ! isset($certs[$kid])) {
            try {
                $response = Http::connectTimeout(2)->timeout(4)->get('https://www.googleapis.com/oauth2/v1/certs');
            } catch (ConnectionException) {
                return null;
            }

            $fetched = $response->json();
            if (! $response->successful() || ! is_array($fetched)) {
                return null;
            }

            $certs = $fetched;
            Cache::put(self::CERTS_CACHE_KEY, $certs, self::CERTS_TTL_SECONDS);
        }

        $certPem = $certs[$kid] ?? null;
        if (! is_string($certPem) || $certPem === '') {
            return null;
        }

        if (openssl_verify("{$parts[0]}.{$parts[1]}", $rawSignature, $certPem, OPENSSL_ALGO_SHA256) !== 1) {
            return null;
        }

        return $payload;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function hasValidClaims(array $payload, string $clientId): bool
    {
        return $clientId !== ''
            && ($payload['aud'] ?? null) === $clientId
            && in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            && (int) ($payload['exp'] ?? 0) > time()
            && is_string($payload['sub'] ?? null)
            && $payload['sub'] !== ''
            && filter_var($payload['email'] ?? '', FILTER_VALIDATE_EMAIL) !== false
            && filter_var($payload['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decodeJwtSegment(string $segment): ?array
    {
        $decoded = $this->base64UrlDecode($segment);
        if ($decoded === null) {
            return null;
        }

        $data = json_decode($decoded, true);

        return is_array($data) ? $data : null;
    }

    private function base64UrlDecode(string $segment): ?string
    {
        if ($segment === '') {
            return null;
        }

        $padded = strtr($segment, '-_', '+/');
        $remainder = strlen($padded) % 4;
        if ($remainder > 0) {
            $padded .= str_repeat('=', 4 - $remainder);
        }

        $decoded = base64_decode($padded, true);

        return $decoded === false ? null : $decoded;
    }
}
