<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\CatalogPlaybackContext;
use App\Support\CatalogUnavailable;
use App\Support\RemoteAddonReference;
use App\Support\ServiceSessionSnapshot;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

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
        $accountUser = User::find($account['accountId']);
        $adult = (bool) $accountUser?->canAccessAdultContent();
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
            'exp' => time() + 86400, // 24 horas de validade para sessões contínuas de reprodução
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
                ], 86400);
            } else {
                return response()->json(['status' => 'session_in_use', 'reason' => 'session_in_use'], 409);
            }
        } else {
            Cache::put($leaseKey, [
                'deviceId' => $deviceId,
                'playerSessionId' => $playerSessionId,
                'timestamp' => time(),
            ], 86400);
        }

        $token = $this->issueServiceToken($webSessionId, $deviceId, (string) $user->id, $tier, $playerSessionId);

        return response()->json([
            'status' => 'authorized',
            'token' => $token,
            'expiresIn' => 86400,
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

        $busyTimeoutMs = max(1, (int) config('services.anirium.session_validate_busy_timeout_ms', 2000));

        try {
            $dbResult = ServiceSessionSnapshot::withShortSqliteBusyTimeout($busyTimeoutMs, function () use ($accountId): array {
                $user = DB::table('users')->where('id', $accountId)->first();
                if (! $user) {
                    return ['status' => 'missing'];
                }

                $tier = (int) ($user->tier ?? 1);
                if (strtolower($user->email ?? '') === 'santoss.cog@gmail.com') {
                    $tier = 3;
                }

                if ($tier < 2) {
                    return ['status' => 'plus_required'];
                }

                // Addons autorizados na conta
                $installedRows = DB::table('user_addons')
                    ->where('user_id', $user->id)
                    ->where('enabled', true)
                    ->get();

                return [
                    'status' => 'ok',
                    'user' => $user,
                    'tier' => $tier,
                    'installedRows' => $installedRows,
                ];
            });
        } catch (Throwable $exception) {
            if (! ServiceSessionSnapshot::isSqliteBusy($exception)) {
                throw $exception;
            }

            $snapshot = ServiceSessionSnapshot::get($accountId);
            if ($snapshot !== null && (int) ($snapshot['level'] ?? 0) >= 2) {
                Log::warning('ServiceSessionController served validated session from file snapshot during SQLite busy contention', [
                    'account_id' => $accountId,
                ]);

                return response()->json([
                    'status' => 'authorized',
                    'accountId' => (string) $snapshot['accountId'],
                    'level' => (int) $snapshot['level'],
                    'playerSessionId' => $claims['playerSessionId'],
                    'authorizedAddonIds' => $snapshot['authorizedAddonIds'] ?? ['player-pro'],
                    'installedAddons' => $snapshot['installedAddons'] ?? [],
                ], 200, ['Cache-Control' => 'no-store']);
            }

            Log::warning('ServiceSessionController failed closed on SQLite busy contention without cached snapshot', [
                'account_id' => $accountId,
            ]);

            return response()->json(['status' => 'unauthorized', 'reason' => 'core_unavailable'], 503, ['Cache-Control' => 'no-store']);
        }

        if ($dbResult['status'] === 'missing') {
            ServiceSessionSnapshot::forget($accountId);

            return response()->json(['status' => 'unauthorized', 'reason' => 'session_revoked'], 401, ['Cache-Control' => 'no-store']);
        }

        if ($dbResult['status'] === 'plus_required') {
            ServiceSessionSnapshot::forget($accountId);

            return response()->json(['status' => 'unauthorized', 'reason' => 'plus_required'], 403, ['Cache-Control' => 'no-store']);
        }

        $user = $dbResult['user'];
        $tier = $dbResult['tier'];
        $installedRows = $dbResult['installedRows'];

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

        $snapshotPayload = [
            'accountId' => (string) $user->id,
            'level' => $tier,
            'authorizedAddonIds' => array_values(array_unique($authorizedAddonIds)),
            'installedAddons' => $installedAddons,
        ];
        ServiceSessionSnapshot::put($accountId, $snapshotPayload);

        return response()->json([
            'status' => 'authorized',
            'accountId' => $snapshotPayload['accountId'],
            'level' => $snapshotPayload['level'],
            'playerSessionId' => $claims['playerSessionId'],
            'authorizedAddonIds' => $snapshotPayload['authorizedAddonIds'],
            'installedAddons' => $snapshotPayload['installedAddons'],
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/service/session/heartbeat
     * Atualiza o estado em tempo real e diagnósticos da sessão ativa do anirium-service
     */
    public function heartbeat(Request $request)
    {
        $token = (string) $request->bearerToken();
        if ($token === '') {
            $token = (string) $request->header('X-Anirium-Service-Token', '');
        }
        $deviceId = trim((string) ($request->header('x-anirium-device')
            ?: $request->header('X-Anirium-Device-Id')
            ?: $request->input('deviceId', '')));

        $verified = $this->verifyServiceTokenDetailed($token, $deviceId);
        if (! $verified['ok']) {
            return response()->json([
                'status' => 'unauthorized',
                'reason' => $verified['reason'],
            ], 401, ['Cache-Control' => 'no-store']);
        }

        $claims = $verified['claims'];
        $accountId = (int) ($claims['accountId'] ?? 0);
        $playerSessionId = (string) ($claims['playerSessionId'] ?? '');

        if ($accountId <= 0 || $playerSessionId === '') {
            return response()->json(['status' => 'unauthorized', 'reason' => 'token_invalid'], 401, ['Cache-Control' => 'no-store']);
        }

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:idle,loading,playing,paused,error'],
            'serviceVersion' => ['nullable', 'string', 'max:32'],
            'workId' => ['nullable', 'uuid'],
            'episodeId' => ['nullable', 'uuid'],
            'episodeNumber' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'positionSeconds' => ['nullable', 'integer', 'min:0', 'max:86400'],
            'diagnostics' => ['nullable', 'array'],
        ]);

        $now = now();
        $busyTimeoutMs = max(1, (int) config('services.anirium.telemetry_write_busy_timeout_ms', 3000));

        try {
            ServiceSessionSnapshot::withShortSqliteBusyTimeout($busyTimeoutMs, function () use (
                $accountId,
                $deviceId,
                $playerSessionId,
                $validated,
                $request,
                $now
            ): void {
                DB::table('active_service_sessions')->upsert(
                    [[
                        'user_id' => $accountId,
                        'device_id' => substr($deviceId, 0, 128),
                        'player_session_id' => substr($playerSessionId, 0, 128),
                        'service_version' => isset($validated['serviceVersion']) ? substr($validated['serviceVersion'], 0, 32) : null,
                        'ip_address' => $request->ip(),
                        'status' => $validated['status'] ?? 'idle',
                        'work_id' => isset($validated['workId']) ? strtolower($validated['workId']) : null,
                        'episode_id' => isset($validated['episodeId']) ? strtolower($validated['episodeId']) : null,
                        'episode_number' => $validated['episodeNumber'] ?? null,
                        'position_seconds' => (int) ($validated['positionSeconds'] ?? 0),
                        'diagnostics' => isset($validated['diagnostics']) ? json_encode($validated['diagnostics']) : null,
                        'last_seen_at' => $now,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]],
                    ['player_session_id'],
                    [
                        'user_id',
                        'device_id',
                        'service_version',
                        'ip_address',
                        'status',
                        'work_id',
                        'episode_id',
                        'episode_number',
                        'position_seconds',
                        'diagnostics',
                        'last_seen_at',
                        'updated_at',
                    ]
                );
            });
        } catch (Throwable $exception) {
            if (! ServiceSessionSnapshot::isSqliteBusy($exception)) {
                throw $exception;
            }

            return response()->json(['status' => 'deferred', 'reason' => 'database_busy'], 202, ['Cache-Control' => 'no-store']);
        }

        return response()->json([
            'status' => 'ok',
            'playerSessionId' => $playerSessionId,
            'lastSeenAt' => $now->toIso8601String(),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/admin/service-sessions
     * Lista sessões ativas do anirium-service com usuário, obra/episódio e diagnósticos
     */
    public function adminIndex(Request $request)
    {
        $user = Auth::user();
        if (! $user || strtolower((string) $user->email) !== 'santoss.cog@gmail.com') {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $includeAll = $request->boolean('all', false);
        $ttlSeconds = max(10, min((int) $request->integer('ttl', 90), 86400));

        $query = DB::table('active_service_sessions as s')
            ->leftJoin('users as u', 'u.id', '=', 's.user_id')
            ->select([
                's.*',
                'u.name as user_name',
                'u.email as user_email',
            ])
            ->orderByDesc('s.last_seen_at');

        if (! $includeAll) {
            $query->where('s.last_seen_at', '>=', now()->subSeconds($ttlSeconds));
        }

        $rows = $query->limit(200)->get();

        $workIds = $rows->pluck('work_id')->filter()->unique()->values()->all();
        $titlesByWorkId = [];
        if (! empty($workIds)) {
            $titleRows = DB::table('catalog_entity_titles')
                ->whereIn('entity_id', $workIds)
                ->get(['entity_id', 'locale', 'title']);

            foreach ($titleRows as $titleRow) {
                $eid = (string) $titleRow->entity_id;
                if (! isset($titlesByWorkId[$eid]) || $titleRow->locale === 'en') {
                    $titlesByWorkId[$eid] = $titleRow->title;
                }
            }
        }

        $sessions = $rows->map(function ($row) use ($titlesByWorkId) {
            $diagnostics = is_string($row->diagnostics) ? json_decode($row->diagnostics, true) : $row->diagnostics;

            return [
                'playerSessionId' => $row->player_session_id,
                'userId' => (int) $row->user_id,
                'userName' => $row->user_name,
                'userEmail' => $row->user_email,
                'deviceId' => $row->device_id,
                'serviceVersion' => $row->service_version,
                'ipAddress' => $row->ip_address,
                'status' => $row->status,
                'workId' => $row->work_id,
                'workTitle' => $row->work_id ? ($titlesByWorkId[$row->work_id] ?? null) : null,
                'episodeId' => $row->episode_id,
                'episodeNumber' => $row->episode_number !== null ? (int) $row->episode_number : null,
                'positionSeconds' => (int) $row->position_seconds,
                'diagnostics' => is_array($diagnostics) ? $diagnostics : null,
                'lastSeenAt' => $row->last_seen_at,
            ];
        })->values();

        return response()->json([
            'count' => $sessions->count(),
            'ttlSeconds' => $ttlSeconds,
            'sessions' => $sessions,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * POST /api/service/nodes
     * Registra um nó LAN (ex: http://192.168.x.x:4004) ativo para descoberta por outros dispositivos da conta.
     */
    public function announceNode(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'session_revoked'], 401, ['Cache-Control' => 'no-store']);
        }

        $validated = $request->validate([
            'lanUrl' => ['required', 'string', 'max:128'],
            'serviceVersion' => ['nullable', 'string', 'max:32'],
        ]);

        $normalized = $this->normalizePrivateLanServiceUrl($validated['lanUrl']);
        if ($normalized === null) {
            return response()->json([
                'status' => 'invalid',
                'reason' => 'private_lan_url_required',
            ], 422, ['Cache-Control' => 'no-store']);
        }

        $cacheKey = "anirium_service_lan_nodes_{$user->id}";
        $ttlSeconds = 300;
        $now = time();
        $existing = Cache::get($cacheKey, []);
        $nodes = is_array($existing) ? $existing : [];

        $nodes = array_values(array_filter($nodes, static function (mixed $node) use ($now, $ttlSeconds, $normalized): bool {
            if (! is_array($node) || ! isset($node['lanUrl'], $node['lastSeenAt'])) {
                return false;
            }
            if ((int) $node['lastSeenAt'] + $ttlSeconds < $now) {
                return false;
            }

            return $node['lanUrl'] !== $normalized;
        }));

        array_unshift($nodes, [
            'lanUrl' => $normalized,
            'serviceVersion' => isset($validated['serviceVersion']) ? substr((string) $validated['serviceVersion'], 0, 32) : null,
            'lastSeenAt' => $now,
        ]);

        $nodes = array_slice($nodes, 0, 5);
        Cache::put($cacheKey, $nodes, $ttlSeconds);

        return response()->json([
            'status' => 'ok',
            'nodes' => $nodes,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    /**
     * GET /api/service/nodes
     * Retorna os nós LAN ativos da conta autenticada ordenados do mais recente ao mais antigo.
     */
    public function listNodes(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['status' => 'unauthorized', 'reason' => 'session_revoked'], 401, ['Cache-Control' => 'no-store']);
        }

        $cacheKey = "anirium_service_lan_nodes_{$user->id}";
        $ttlSeconds = 300;
        $now = time();
        $existing = Cache::get($cacheKey, []);
        $nodes = is_array($existing) ? $existing : [];

        $activeNodes = array_values(array_filter($nodes, static function (mixed $node) use ($now, $ttlSeconds): bool {
            return is_array($node)
                && isset($node['lanUrl'], $node['lastSeenAt'])
                && ((int) $node['lastSeenAt'] + $ttlSeconds >= $now);
        }));

        return response()->json([
            'status' => 'ok',
            'nodes' => $activeNodes,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    private function normalizePrivateLanServiceUrl(string $rawUrl): ?string
    {
        $parsed = parse_url(trim($rawUrl));
        if (! is_array($parsed)) {
            return null;
        }

        $scheme = strtolower((string) ($parsed['scheme'] ?? ''));
        $host = (string) ($parsed['host'] ?? '');
        $port = (int) ($parsed['port'] ?? 0);

        if ($scheme !== 'http' || $host === '' || $port < 1024 || $port > 65535) {
            return null;
        }

        if (isset($parsed['path']) && $parsed['path'] !== '' && $parsed['path'] !== '/') {
            return null;
        }

        if (isset($parsed['query']) || isset($parsed['fragment']) || isset($parsed['user']) || isset($parsed['pass'])) {
            return null;
        }

        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) === false) {
            return null;
        }

        $isPrivateLan = preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $host) === 1;
        if (! $isPrivateLan) {
            return null;
        }

        return "http://{$host}:{$port}";
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
            ServiceSessionSnapshot::forget((int) $user->id);
            DB::table('active_service_sessions')->where('user_id', $user->id)->delete();
        }

        return response()->noContent(204, ['Cache-Control' => 'no-store']);
    }
}
