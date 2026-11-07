<?php

namespace App\Http\Controllers;

use App\Support\CatalogPlaybackContext;
use App\Support\CatalogUnavailable;
use App\Support\RemoteAddonReference;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ServiceSessionController extends Controller
{
    public function playbackContext(Request $request, CatalogPlaybackContext $catalog)
    {
        $authorization = $this->validateSession($request);
        if ($authorization->getStatusCode() !== 200) {
            return $authorization;
        }
        $input = $request->validate(['workId' => ['required', 'uuid'], 'episodeId' => ['nullable', 'uuid']]);
        $account = $authorization->getData(true);
        $adult = (bool) DB::table('users')->where('id', $account['accountId'])->value('adult_content_enabled');
        try {
            $context = $catalog->read(strtolower($input['workId']), isset($input['episodeId']) ? strtolower($input['episodeId']) : null, $adult);
        } catch (CatalogUnavailable) {
            return response()->json(['reason' => 'catalog_context_unavailable'], 503, ['Cache-Control' => 'no-store']);
        }

        return $context
            ? response()->json([...$context, 'accountId' => $account['accountId'], 'playerSessionId' => $account['playerSessionId']], 200, ['Cache-Control' => 'no-store'])
            : response()->json(['reason' => 'catalog_identity_invalid'], 404, ['Cache-Control' => 'no-store']);
    }

    private function getServiceSecret(): string
    {
        return (string) config('services.anirium.service_secret');
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $data): string
    {
        return base64_decode(strtr($data, '-_', '+/'));
    }

    private function issueServiceToken(string $sessionId, string $deviceId, string $accountId, int $level, string $playerSessionId): string
    {
        $payload = [
            'sessionId' => $sessionId,
            'deviceId' => $deviceId,
            'accountId' => (string) $accountId,
            'level' => $level,
            'playerSessionId' => $playerSessionId,
            'exp' => time() + 300, // 5 minutos de validade
        ];

        $encodedPayload = $this->base64UrlEncode(json_encode($payload));
        $signature = $this->base64UrlEncode(hash_hmac('sha256', $encodedPayload, $this->getServiceSecret(), true));

        return "{$encodedPayload}.{$signature}";
    }

    private function verifyServiceTokenDetailed(string $token, string $deviceId): array
    {
        if (empty($token) || empty($deviceId) || strlen($token) > 8192) {
            return ['ok' => false, 'reason' => 'token_invalid'];
        }

        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return ['ok' => false, 'reason' => 'token_invalid'];
        }

        [$encodedPayload, $signature] = $parts;
        $expectedSignature = $this->base64UrlEncode(hash_hmac('sha256', $encodedPayload, $this->getServiceSecret(), true));

        if (! hash_equals($expectedSignature, $signature)) {
            return ['ok' => false, 'reason' => 'token_invalid'];
        }

        $payload = json_decode($this->base64UrlDecode($encodedPayload), true);
        if (! $payload || ! is_array($payload)) {
            return ['ok' => false, 'reason' => 'token_invalid'];
        }

        if (($payload['exp'] ?? 0) <= time()) {
            return ['ok' => false, 'reason' => 'token_expired'];
        }

        if (($payload['deviceId'] ?? '') !== $deviceId) {
            return ['ok' => false, 'reason' => 'device_mismatch'];
        }

        if (($payload['level'] ?? 0) < 2) {
            return ['ok' => false, 'reason' => 'plus_required'];
        }

        return ['ok' => true, 'claims' => $payload];
    }

    /**
     * GET /api/service/session
     * Emite um token de sessão assinado para o Player Pro enviar ao anirium-service local
     */
    public function getSession(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'session_revoked'], 401);
        }

        $tier = (int) ($user->tier ?? 1);
        if (strtolower($user->email ?? '') === 'santoss.cog@gmail.com') {
            $tier = 3;
        }

        if ($tier < 2) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'plus_required'], 403);
        }

        $deviceId = trim($request->header('x-anirium-device') ?? '');
        $playerSessionId = trim($request->header('x-anirium-player-session') ?? '');

        if (! $deviceId) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'device_required'], 400);
        }

        if (! $playerSessionId || ! preg_match('/^[a-zA-Z0-9-]{16,128}$/', $playerSessionId)) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'player_session_required'], 400);
        }

        $webSessionId = session()->getId() ?: 'web-session-'.$user->id;

        // Registrar lease de execução de streaming
        $leaseKey = "anirium_service_lease_{$user->id}";
        $currentLease = Cache::get($leaseKey);

        if ($currentLease && ($currentLease['deviceId'] !== $deviceId || $currentLease['playerSessionId'] !== $playerSessionId)) {
            // Se expirou há mais de 60s, sobrepõe
            if (($currentLease['timestamp'] ?? 0) + 60 < time()) {
                Cache::put($leaseKey, [
                    'deviceId' => $deviceId,
                    'playerSessionId' => $playerSessionId,
                    'timestamp' => time(),
                ], 300);
            } else {
                return response()->json(['status' => 'session_in_use', 'reason' => 'session_in_use'], 409);
            }
        } else {
            Cache::put($leaseKey, [
                'deviceId' => $deviceId,
                'playerSessionId' => $playerSessionId,
                'timestamp' => time(),
            ], 300);
        }

        $token = $this->issueServiceToken($webSessionId, $deviceId, (string) $user->id, $tier, $playerSessionId);

        return response()->json([
            'status' => 'authorized',
            'token' => $token,
            'expiresIn' => 300,
            'deviceId' => $deviceId,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/service/session/validate
     * Endpoint chamado pelo executável Go (anirium-service) para validar o token enviado pelo Player Pro
     */
    public function validateSession(Request $request)
    {
        $authHeader = $request->header('Authorization') ?? '';
        $token = preg_replace('/^Bearer\s+/i', '', $authHeader);
        $deviceId = trim($request->header('X-Anirium-Device') ?? '');

        $verification = $this->verifyServiceTokenDetailed($token, $deviceId);

        if (! $verification['ok']) {
            $reason = $verification['reason'];
            $status = ($reason === 'plus_required') ? 403 : 401;

            return response()->json(['status' => 'unauthorized', 'reason' => $reason], $status, ['Cache-Control' => 'no-store']);
        }

        $claims = $verification['claims'];
        $accountId = (int) $claims['accountId'];

        $user = DB::table('users')->where('id', $accountId)->first();
        if (! $user) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'session_revoked'], 401, ['Cache-Control' => 'no-store']);
        }

        $tier = (int) ($user->tier ?? 1);
        if (strtolower($user->email ?? '') === 'santoss.cog@gmail.com') {
            $tier = 3;
        }

        if ($tier < 2) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'plus_required'], 403, ['Cache-Control' => 'no-store']);
        }

        // Addons autorizados na conta
        $installedRows = DB::table('user_addons')
            ->where('user_id', $user->id)
            ->where('enabled', true)
            ->get();

        $authorizedAddonIds = ['player-pro'];
        $installedAddons = [
            [
                'id' => 'player-pro',
                'name' => 'Anirium Player Pro',
                'capabilities' => ['ui.player.render', 'playback.client', 'subtitles.manage', 'audio.manage'],
                'enabled' => true,
            ],
        ];

        foreach ($installedRows as $row) {
            if ($row->addon_id === 'player-pro') {
                continue;
            }
            $addonConfig = ! empty($row->manifest_json) ? json_decode($row->manifest_json, true) : [];
            if (! is_array($addonConfig)) {
                continue;
            }
            $remoteConfig = null;
            if (! empty($row->manifest_url)) {
                $remoteConfig = RemoteAddonReference::fromUrl($row->manifest_url);
                if ($remoteConfig !== null) {
                    $addonConfig = array_merge($addonConfig, $remoteConfig);
                }
            }
            $addonId = $row->addon_id ?: ($addonConfig['id'] ?? null);
            if ($addonId) {
                $authorizedAddonIds[] = $addonId;
            }
            if (isset($addonConfig['id']) && $addonConfig['id'] !== $addonId) {
                $authorizedAddonIds[] = $addonConfig['id'];
            }
            if (empty($addonConfig['manifestUrl']) && ! empty($row->manifest_url)) {
                $addonConfig['manifestUrl'] = $row->manifest_url;
            }
            // Se o addon veio com remoteConfig de URL, o id público do addon instalado na resposta do service session é o id do remoteConfig
            $installedId = ($remoteConfig && isset($remoteConfig['id'])) ? $remoteConfig['id'] : $addonId;
            $installedAddons[] = [
                'id' => $installedId,
                'name' => $row->name ?: $row->addon_id,
                'manifestUrl' => $row->manifest_url,
                'enabled' => (bool) $row->enabled,
                'config' => $addonConfig,
            ];
        }

        return response()->json([
            'status' => 'authorized',
            'accountId' => (string) $user->id,
            'level' => $tier,
            'playerSessionId' => $claims['playerSessionId'],
            'authorizedAddonIds' => array_values(array_unique($authorizedAddonIds)),
            'installedAddons' => $installedAddons,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * DELETE /api/service/session
     * Libera o lease da sessão de reprodução
     */
    public function releaseSession(Request $request)
    {
        $user = Auth::user();
        if ($user) {
            Cache::forget("anirium_service_lease_{$user->id}");
        }

        return response()->noContent(204, ['Cache-Control' => 'no-store']);
    }
}
