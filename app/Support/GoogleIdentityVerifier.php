<?php

namespace App\Support;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class GoogleIdentityVerifier
{
    public function verify(string $token, string $clientId): ?array
    {
        try {
            $response = Http::timeout(8)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $token]);
        } catch (ConnectionException) {
            return null;
        }
        $payload = $response->json();
        if (! $response->successful() || ! is_array($payload)
            || $clientId === '' || ($payload['aud'] ?? null) !== $clientId
            || ! in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            || (int) ($payload['exp'] ?? 0) <= time()
            || ! is_string($payload['sub'] ?? null) || $payload['sub'] === ''
            || ! filter_var($payload['email'] ?? '', FILTER_VALIDATE_EMAIL)
            || ! filter_var($payload['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            return null;
        }

        return $payload;
    }
}
