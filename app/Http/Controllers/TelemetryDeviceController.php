<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\RealtimeEventStore;
use App\Support\AccountAchievementCatalog;
use App\Support\AccountExperience;
use App\Support\CatalogActionTarget;
use App\Support\CatalogIdentityStore;
use App\Support\CatalogPreferenceProjection;
use App\Support\CatalogPreferenceReconciliation;
use App\Support\CatalogUserCompletion;
use App\Support\EntityContextAliases;
use App\Support\EntityFanTierEvaluator;
use App\Support\RemoteAddonReference;
use App\Support\ServiceSessionSnapshot;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class TelemetryDeviceController extends Controller
{
    /**
     * Calcula e atualiza a presença diária + streaks (1 dia, 1 semana, 1 mês, 1 ano) para um usuário logado.
     */
    public static function evaluateDailyStreak(User $user): array
    {
        $today = Carbon::today()->toDateString();
        $yesterday = Carbon::yesterday()->toDateString();
        $lastDate = $user->last_presence_date ? Carbon::parse($user->last_presence_date)->toDateString() : null;

        $currentStreak = (int) ($user->current_streak ?? 0);
        $longestStreak = (int) ($user->longest_streak ?? 0);
        $streakXp = (int) ($user->streak_xp ?? 0);
        $gainedToday = 0;

        if ($lastDate !== $today) {
            if ($lastDate === $yesterday) {
                $currentStreak += 1;
            } else {
                $currentStreak = 1;
            }

            if ($currentStreak > $longestStreak) {
                $longestStreak = $currentStreak;
            }

            // +10 XP de presença diária
            $gainedToday += 10;

            // +50 XP extra a cada 7 dias consecutivos (Streak Semanal)
            if ($currentStreak > 0 && $currentStreak % 7 === 0) {
                $gainedToday += 50;
            }

            // +250 XP extra a cada 30 dias consecutivos (Streak Mensal)
            if ($currentStreak > 0 && $currentStreak % 30 === 0) {
                $gainedToday += 250;
            }

            // +2500 XP extra a cada 365 dias consecutivos (Streak Anual)
            if ($currentStreak > 0 && $currentStreak % 365 === 0) {
                $gainedToday += 2500;
            }

            $streakXp += $gainedToday;

            $user->current_streak = $currentStreak;
            $user->longest_streak = $longestStreak;
            $user->streak_xp = $streakXp;
            $user->last_presence_date = $today;
            $user->saveQuietly();
        }

        return [
            'current_streak' => $currentStreak,
            'longest_streak' => $longestStreak,
            'streak_xp' => $streakXp,
            'last_presence_date' => $today,
            'gained_today' => $gainedToday,
        ];
    }

    /**
     * Registra ou valida o dispositivo único de um usuário logado.
     * Retorna status 409 se outra máquina já estiver ativamente conectada.
     */
    public function registerDevice(Request $request)
    {
        $raw = $request->json()->all();
        if (empty($raw)) {
            $raw = json_decode($request->getContent(), true) ?: $request->all();
        }

        $fingerprint = $raw['machine_fingerprint'] ?? null;
        if (! $fingerprint) {
            return response()->json(['error' => 'machine_fingerprint_required'], 422);
        }

        $user = Auth::user();
        if (! $user && ! empty($raw['user_id'])) {
            $user = User::find($raw['user_id']);
        }

        if (! $user) {
            return response()->json(['status' => 'guest_allowed'], 200);
        }

        $ip = $request->ip();
        $userAgent = $request->userAgent();

        $activeDevice = DB::table('active_user_devices')->where('user_id', $user->id)->first();

        if ($activeDevice) {
            // Se o fingerprint for diferente e a sessão foi ativa nos últimos 120 segundos
            $lastPing = strtotime($activeDevice->last_ping_at);
            $isActive = (time() - $lastPing) < 120;

            if ($activeDevice->machine_fingerprint !== $fingerprint && $isActive) {
                return response()->json([
                    'error' => 'concurrent_session_blocked',
                    'message' => 'Esta conta já está conectada em outro dispositivo.',
                ], 409);
            }

            // Atualiza para a máquina atual
            DB::table('active_user_devices')->where('user_id', $user->id)->update([
                'machine_fingerprint' => $fingerprint,
                'ip_address' => $ip,
                'user_agent' => $userAgent,
                'last_ping_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            DB::table('active_user_devices')->insert([
                'user_id' => $user->id,
                'machine_fingerprint' => $fingerprint,
                'ip_address' => $ip,
                'user_agent' => $userAgent,
                'last_ping_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $streakState = self::evaluateDailyStreak($user);

        return response()->json([
            'status' => 'device_synchronized',
            'tier' => $user->tier,
            'streak' => $streakState,
            'active_minutes' => (int) ($user->active_minutes ?? 0),
        ]);
    }

    /**
     * Recebe batches de telemetria leve (de guests ou logados).
     */
    public function recordEvents(Request $request)
    {
        $raw = $request->json()->all();
        if (empty($raw)) {
            $raw = json_decode($request->getContent(), true) ?: $request->all();
        }

        $events = $raw['events'] ?? [];
        $fingerprint = is_string($raw['machine_fingerprint'] ?? null) && $raw['machine_fingerprint'] !== ''
            ? $raw['machine_fingerprint']
            : 'anonymous';
        $user = Auth::user();
        $userId = $user?->id;

        if (! is_array($events) || empty($events)) {
            return response()->json(['status' => 'empty'], 200);
        }

        $rows = [];
        $now = now();
        $activeMinuteIncrements = 0;
        $uploadedBytesIncrement = 0;
        $downloadedBytesIncrement = 0;
        $seedingSecondsIncrement = 0;

        foreach ($events as $ev) {
            if (! is_array($ev) || (isset($ev['target_id']) && ! is_string($ev['target_id']))) {
                return response()->json(['error' => 'invalid_event_target'], 422);
            }
            $rawEventType = is_string($ev['event_type'] ?? null) ? $ev['event_type'] : 'presence_ping';
            $eventType = substr($rawEventType, 0, 32);
            if ($eventType === 'active_minute') {
                $activeMinuteIncrements += 1;
            } elseif ($eventType === 'p2p_seeding_heartbeat') {
                // Validação e contabilização antifraude de tráfego P2P
                $payload = is_array($ev['payload'] ?? null) ? $ev['payload'] : [];
                $upBytes = max(0, min((int) ($payload['delta_uploaded_bytes'] ?? 0), 200 * 1024 * 1024)); // teto máx 200MB/min
                $downBytes = max(0, min((int) ($payload['delta_downloaded_bytes'] ?? 0), 500 * 1024 * 1024));
                $seedSec = max(0, min((int) ($payload['seeding_seconds'] ?? 60), 300));

                $uploadedBytesIncrement += $upBytes;
                $downloadedBytesIncrement += $downBytes;
                $seedingSecondsIncrement += $seedSec;
            }
            $eventTargetType = $ev['target_type'] ?? 'global';
            if (! is_string($eventTargetType) || ! in_array($eventTargetType, ['global', ...CatalogIdentityStore::KINDS], true)) {
                return response()->json(['error' => 'invalid_target_type'], 422);
            }
            $eventTargetId = is_string($ev['target_id'] ?? null) ? $ev['target_id'] : 'none';
            if ($eventTargetType === 'global') {
                $eventTargetId = substr($eventTargetId, 0, 64);
                $eventEntityId = null;
            } else {
                $eventEntityId = app(CatalogActionTarget::class)->canonical($eventTargetType, $eventTargetId);
                if ($eventEntityId === null) {
                    return response()->json(['error' => 'invalid_entity_id'], 422);
                }
            }
            $rows[] = [
                'user_id' => $userId,
                'machine_fingerprint' => substr($fingerprint, 0, 64),
                'target_type' => $eventTargetType,
                'target_id' => $eventEntityId ?? $eventTargetId,
                'entity_id' => $eventEntityId,
                'event_type' => $eventType,
                'payload' => isset($ev['payload']) ? json_encode($ev['payload']) : null,
                'created_at' => $now,
            ];
        }

        $busyTimeoutMs = max(1, (int) config('services.anirium.telemetry_write_busy_timeout_ms', 3000));

        try {
            ServiceSessionSnapshot::withShortSqliteBusyTimeout($busyTimeoutMs, function () use (
                $rows,
                $user,
                $now,
                $activeMinuteIncrements,
                $uploadedBytesIncrement,
                $downloadedBytesIncrement,
                $seedingSecondsIncrement
            ): void {
                DB::transaction(function () use (
                    $rows,
                    $user,
                    $now,
                    $activeMinuteIncrements,
                    $uploadedBytesIncrement,
                    $downloadedBytesIncrement,
                    $seedingSecondsIncrement
                ): void {
                    DB::table('user_interaction_events')->insert($rows);

                    // Se o usuário estiver logado, atualiza o last_ping da máquina, minutos ativos e streak diária
                    if ($user) {
                        DB::table('active_user_devices')->where('user_id', $user->id)->update([
                            'last_ping_at' => $now,
                        ]);

                        self::evaluateDailyStreak($user);

                        if ($activeMinuteIncrements > 0) {
                            $user->active_minutes = (int) ($user->active_minutes ?? 0) + $activeMinuteIncrements;
                        }

                        if ($uploadedBytesIncrement > 0 || $downloadedBytesIncrement > 0 || $seedingSecondsIncrement > 0) {
                            $user->bytes_uploaded = (int) ($user->bytes_uploaded ?? 0) + $uploadedBytesIncrement;
                            $user->bytes_downloaded = (int) ($user->bytes_downloaded ?? 0) + $downloadedBytesIncrement;
                            $user->seeding_seconds = (int) ($user->seeding_seconds ?? 0) + $seedingSecondsIncrement;

                            // 1 MB seeded = 1 XP | cada 60s seeding ativo = 2 XP
                            $mbSeededXp = (int) floor($uploadedBytesIncrement / (1024 * 1024));
                            $timeSeededXp = (int) floor($seedingSecondsIncrement / 30);
                            $newSeedingXp = $mbSeededXp + $timeSeededXp;

                            if ($newSeedingXp > 0) {
                                $user->seeding_xp = (int) ($user->seeding_xp ?? 0) + $newSeedingXp;
                            }
                        }

                        $user->saveQuietly();
                    }
                });
            });
        } catch (Throwable $exception) {
            if (! ServiceSessionSnapshot::isSqliteBusy($exception)) {
                throw $exception;
            }

            Log::warning('TelemetryDeviceController deferred telemetry event batch during SQLite busy contention', [
                'user_id' => $userId,
                'count' => count($rows),
            ]);

            return response()->json([
                'status' => 'deferred',
                'reason' => 'database_busy',
                'count' => 0,
            ], 202);
        }

        return response()->json([
            'status' => 'recorded',
            'count' => count($rows),
            'active_minutes' => $user ? (int) $user->active_minutes : 0,
            'bytes_uploaded' => $user ? (int) $user->bytes_uploaded : 0,
            'bytes_downloaded' => $user ? (int) $user->bytes_downloaded : 0,
            'seeding_seconds' => $user ? (int) $user->seeding_seconds : 0,
            'seeding_xp' => $user ? (int) $user->seeding_xp : 0,
            'current_streak' => $user ? (int) $user->current_streak : 0,
            'streak_xp' => $user ? (int) $user->streak_xp : 0,
        ]);
    }

    /**
     * Endpoint simulado para testes rápidos em ambiente de desenvolvimento/staging
     */
    public function simulateLogin(Request $request)
    {
        if (app()->environment('production')) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $email = strtolower(trim((string) $request->input('email', 'dev@anirium.test')));
        $isAdminOwner = $email === 'santoss.cog@gmail.com';
        $defaultTier = $isAdminOwner ? 3 : 1;

        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $isAdminOwner ? 'Santos Admin' : 'Membro Anirium',
                'google_id' => 'dev-mock-'.md5($email),
                'avatar' => 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
                'tier' => $defaultTier,
            ]
        );

        self::evaluateDailyStreak($user);
        Auth::login($user);

        return response()->json([
            'status' => 'logged_in',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $user->avatar,
                'tier' => $user->tier,
                'active_minutes' => (int) ($user->active_minutes ?? 0),
                'current_streak' => (int) ($user->current_streak ?? 0),
                'longest_streak' => (int) ($user->longest_streak ?? 0),
                'streak_xp' => (int) ($user->streak_xp ?? 0),
                'adult_content_enabled' => $user->canAccessAdultContent(),
                'age_verified' => $user->isAgeVerified(),
                'age_verification_status' => (string) ($user->age_verification_status ?? 'unverified'),
                'age_verification_method' => $user->age_verification_method,
            ],
        ]);
    }

    /**
     * Define ou atualiza preferência/estado do usuário para qualquer ID da ontologia
     * (universo, obra, temporada, arco, episódio)
     */
    public function setEntityPreference(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $raw = $request->json()->all() ?: $request->all();
        $targetType = $raw['target_type'] ?? 'work';
        $targetId = (string) ($raw['target_id'] ?? '');

        if (! $targetId) {
            return response()->json(['error' => 'target_id_required'], 422);
        }

        if (! is_string($targetType) || ! in_array($targetType, CatalogIdentityStore::KINDS, true)) {
            return response()->json(['error' => 'invalid_target_type'], 422);
        }
        $entityId = app(CatalogActionTarget::class)->canonical($targetType, $targetId);
        if ($entityId === null) {
            return response()->json(['error' => 'invalid_entity_id'], 422);
        }
        $targetId = $entityId;

        return DB::transaction(function () use ($user, $targetType, $targetId, $entityId, $raw) {
            $existing = app(CatalogPreferenceReconciliation::class)->run($user->id, $targetType, $entityId);

            $updateData = [
                'last_interacted_at' => now(),
                'updated_at' => now(),
            ];
            if ($entityId !== null) {
                $updateData['entity_id'] = $entityId;
            }

            if (array_key_exists('status', $raw)) {
                $updateData['status'] = $raw['status'];
            }
            if (array_key_exists('user_score', $raw)) {
                $updateData['user_score'] = $raw['user_score'] !== null ? (int) $raw['user_score'] : null;
            }
            if (array_key_exists('bookmarked', $raw)) {
                $updateData['bookmarked'] = (bool) $raw['bookmarked'];
            }
            if (array_key_exists('liked', $raw)) {
                $updateData['liked'] = (bool) $raw['liked'];
            }
            if (array_key_exists('progress_seconds', $raw)) {
                $updateData['progress_seconds'] = (int) $raw['progress_seconds'];
            }
            if (array_key_exists('metadata', $raw) && is_array($raw['metadata'])) {
                $existingMeta = ($existing && ! empty($existing->metadata))
                    ? (json_decode($existing->metadata, true) ?: [])
                    : [];
                $updateData['metadata'] = json_encode(array_merge($existingMeta, $raw['metadata']));
            }

            if ($existing) {
                $savedId = $existing->id;
                DB::table('user_entity_preferences')
                    ->where('id', $existing->id)
                    ->update($updateData);
            } else {
                $savedId = DB::table('user_entity_preferences')->insertGetId(array_merge([
                    'user_id' => $user->id,
                    'target_type' => $targetType,
                    'target_id' => $targetId,
                    'created_at' => now(),
                ], $updateData));
            }

            $saved = DB::table('user_entity_preferences')
                ->where('user_id', $user->id)
                ->where('id', $savedId)
                ->first();

            // Avalia automaticamente o Tier de Fã da Obra caso a preferência seja de obra ou episódio
            $workIdToEvaluate = $targetType === 'work' ? $targetId : null;
            if ($targetType === 'episode') {
                $workIdToEvaluate = DB::table('catalog_episodes')->where('id', $targetId)->value('work_id');
            }

            $fanEvaluation = null;
            if ($workIdToEvaluate) {
                $fanEvaluation = app(EntityFanTierEvaluator::class)->evaluateWork($user, (string) $workIdToEvaluate);
            }

            $events = app(RealtimeEventStore::class);
            $events->publish('user:'.$user->id, 'preference.confirmed', [
                'target_type' => $targetType,
                'target_id' => $targetId,
                'preference' => $saved,
            ]);

            if (array_key_exists('user_score', $raw)) {
                $avgScore = DB::table('user_entity_preferences')
                    ->where('target_type', $targetType)
                    ->where('target_id', $targetId)
                    ->whereNotNull('user_score')
                    ->where('user_score', '>', 0)
                    ->avg('user_score');

                $events->publish("entity:{$targetType}:{$targetId}", 'entity.rating_updated', [
                    'target_type' => $targetType,
                    'target_id' => $targetId,
                    'community_score' => $avgScore !== null ? round((float) $avgScore, 1) : null,
                ]);
            }

            if (array_key_exists('progress_seconds', $raw) || array_key_exists('status', $raw)) {
                $episodeRow = $targetType === 'episode'
                    ? DB::table('catalog_episodes')->where('id', $targetId)->first(['id', 'work_id', 'number', 'title', 'runtime_minutes'])
                    : null;
                $resolvedWorkId = $workIdToEvaluate ?: ($episodeRow->work_id ?? ($raw['work_id'] ?? ($targetType === 'work' ? $targetId : null)));
                $workRow = $resolvedWorkId
                    ? DB::table('catalog_works')->where('id', $resolvedWorkId)->first(['id', 'title', 'image_url'])
                    : null;
                $durationSec = max(1, ((int) ($episodeRow->runtime_minutes ?? 24)) * 60);
                $posSec = (int) ($saved->progress_seconds ?? 0);
                $isWatched = ($saved->status ?? '') === 'completed';

                $events->publish('user:'.$user->id, 'progress.updated', [
                    'workId' => $resolvedWorkId,
                    'workTitle' => $workRow->title ?? null,
                    'image' => $workRow->image_url ?? null,
                    'episodeId' => $targetType === 'episode' ? $targetId : null,
                    'episodeNumber' => (int) ($episodeRow->number ?? ($raw['episode_number'] ?? 1)),
                    'positionSeconds' => $posSec,
                    'durationSeconds' => $durationSec,
                    'isWatched' => $isWatched,
                    'updatedAt' => now()->toIso8601String(),
                ]);
            }

            return response()->json([
                'status' => 'saved',
                'preference' => $saved,
                'fan_state' => $fanEvaluation,
                'catalog_completion' => app(CatalogUserCompletion::class)->read($user->id),
            ]);
        });
    }

    /**
     * Retorna todas as preferências e alvos comentados do usuário logado para sincronizar gamificação e estado
     */
    public function getEntityPreferences(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json([
                'preferences' => [],
                'commented_targets' => [],
                'gamification' => null,
            ]);
        }

        self::evaluateDailyStreak($user);

        $targetId = $request->query('target_id');
        $targetType = $request->query('target_type');

        $query = DB::table('user_entity_preferences')->where('user_id', $user->id);
        if ($targetId) {
            $query->where(app(EntityContextAliases::class)->matching((string) $targetType, (string) $targetId, $user->canAccessAdultContent()));
        }
        if ($targetType) {
            $query->where('target_type', $targetType);
        }

        $list = app(CatalogPreferenceProjection::class)->apply($query->get());

        $commentedTargets = DB::table('entity_discussions as d')->join('catalog_entities as e', 'e.id', '=', 'd.entity_id')
            ->where('d.user_id', $user->id)->whereColumn('d.target_type', 'e.kind')->where('e.resolution_status', 'verified')
            ->distinct()->pluck('d.entity_id');

        return response()->json([
            'preferences' => $list,
            'commented_targets' => $commentedTargets,
            'gamification' => [
                'catalog_completion' => app(CatalogUserCompletion::class)->read($user->id),
                'active_minutes' => (int) ($user->active_minutes ?? 0),
                'current_streak' => (int) ($user->current_streak ?? 0),
                'longest_streak' => (int) ($user->longest_streak ?? 0),
                'streak_xp' => (int) ($user->streak_xp ?? 0),
                'adult_content_enabled' => $user->canAccessAdultContent(),
                'age_verified' => $user->isAgeVerified(),
                'age_verification_status' => (string) ($user->age_verification_status ?? 'unverified'),
                'age_verification_method' => $user->age_verification_method,
                'custom_title' => $user->custom_title,
            ],
        ]);
    }

    /**
     * Atualiza configurações explícitas da conta do usuário (ex.: filtro +18 Anos / Hentai, título customizado ou sincronização de XP/Level)
     */
    public function updateAccountSettings(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $raw = $request->json()->all() ?: $request->all();

        if (array_key_exists('adult_content_enabled', $raw)) {
            $requestedAdult = (bool) $raw['adult_content_enabled'];
            if ($requestedAdult && ! $user->isAgeVerified()) {
                $user->adult_content_enabled = false;
                $user->saveQuietly();

                return response()->json([
                    'error' => $user->isUnderageBlocked() ? 'underage_blocked' : 'age_verification_required',
                    'age_verification_status' => (string) ($user->age_verification_status ?? 'unverified'),
                    'age_verified' => false,
                    'adult_content_enabled' => false,
                ], 403);
            }
            $user->adult_content_enabled = $requestedAdult;
        }
        if (array_key_exists('custom_title_id', $raw) || array_key_exists('custom_title', $raw)) {
            $requested = array_key_exists('custom_title_id', $raw) ? $raw['custom_title_id'] : $raw['custom_title'];
            $achievements = app(AccountAchievementCatalog::class);
            $id = $achievements->resolve($requested);
            if ($requested !== null && ($id === null || ! in_array($id, $achievements->allowed($user), true))) {
                return response()->json(['error' => 'achievement_not_available'], 422);
            }
            $user->custom_title = $id;
        }
        $user->saveQuietly();
        $completion = app(CatalogUserCompletion::class)->read($user->id);
        $experience = app(AccountExperience::class)->read($user, $completion);

        $accountPayload = [
            'adult_content_enabled' => $user->canAccessAdultContent(),
            'age_verified' => $user->isAgeVerified(),
            'age_verification_status' => (string) ($user->age_verification_status ?? 'unverified'),
            'age_verification_method' => $user->age_verification_method,
            'custom_title' => $user->custom_title,
            'xp' => $experience['total'],
            'level' => $experience['level'],
        ];

        app(RealtimeEventStore::class)->publish('user:'.$user->id, 'account.updated', $accountPayload);

        return response()->json(array_merge(['status' => 'updated'], $accountPayload));
    }

    /**
     * Posta comentário/discussão em qualquer ID da ontologia
     */
    public function addDiscussionComment(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $raw = $request->json()->all() ?: $request->all();
        $targetType = $raw['target_type'] ?? 'work';
        $targetId = (string) ($raw['target_id'] ?? '');
        $commentBody = trim($raw['comment_body'] ?? '');

        if (! $targetId || empty($commentBody)) {
            return response()->json(['error' => 'target_id_and_body_required'], 422);
        }

        if (! is_string($targetType) || ! in_array($targetType, CatalogIdentityStore::KINDS, true)) {
            return response()->json(['error' => 'invalid_target_type'], 422);
        }
        $entityId = app(CatalogActionTarget::class)->canonical($targetType, $targetId);
        if ($entityId === null) {
            return response()->json(['error' => 'invalid_entity_id'], 422);
        }
        $targetId = $entityId;

        $id = DB::table('entity_discussions')->insertGetId([
            'user_id' => $user->id,
            'entity_id' => $entityId,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'comment_body' => $commentBody,
            'contains_spoilers' => (bool) ($raw['contains_spoilers'] ?? false),
            'parent_comment_id' => ! empty($raw['parent_comment_id']) ? (int) $raw['parent_comment_id'] : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $inserted = DB::table('entity_discussions as ed')
            ->join('users as u', 'ed.user_id', '=', 'u.id')
            ->select('ed.*', 'u.name as user_name', 'u.avatar as user_avatar')
            ->where('ed.id', $id)
            ->first();

        // Se o comentário for em uma obra, aciona a reavaliação de Fã da Obra
        $fanEvaluation = null;
        if ($targetType === 'work') {
            $fanEvaluation = app(EntityFanTierEvaluator::class)->evaluateWork($user, (string) $targetId);
        }

        if ($inserted) {
            app(RealtimeEventStore::class)->publish("entity:{$targetType}:{$targetId}", 'comment.posted', [
                'target_type' => $targetType,
                'target_id' => $targetId,
                'comment' => $inserted,
            ]);
        }

        return response()->json([
            'status' => 'comment_created',
            'comment' => $inserted,
            'fan_state' => $fanEvaluation,
        ], 201);
    }

    /**
     * Lista comentários de qualquer ID da ontologia com suporte a sincronização delta (since timestamp)
     */
    public function getEntityDiscussions(Request $request, string $type, string $id)
    {
        $since = $request->query('since');
        $allowAdult = (bool) $request->user()?->canAccessAdultContent();
        $query = DB::table('entity_discussions as ed')
            ->join('users as u', 'ed.user_id', '=', 'u.id')
            ->select('ed.*', 'u.name as user_name', 'u.avatar as user_avatar')
            ->where('ed.target_type', $type)
            ->where(app(EntityContextAliases::class)->matching($type, $id, $allowAdult, 'ed.'));

        if ($since) {
            $query->where('ed.created_at', '>', $since);
        }

        $comments = $query->orderBy('ed.created_at', 'desc')->get();

        $latestTimestamp = DB::table('entity_discussions as ed')
            ->where('ed.target_type', $type)
            ->where(app(EntityContextAliases::class)->matching($type, $id, $allowAdult, 'ed.'))
            ->max('ed.created_at');

        return response()->json([
            'comments' => $comments,
            'cursor' => $latestTimestamp,
            'is_delta' => ! empty($since),
        ]);
    }

    /**
     * Lista os addons da conta com separação canônica:
     * - Addons Anirium+ (só aparecem se Tier >= 2)
     * - Addons da Comunidade (disponíveis para Tier 1, 2 e 3)
     */
    public function listUserAddons(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $tier = (int) ($user->tier ?? 1);
        if (strtolower($user->email ?? '') === 'santoss.cog@gmail.com') {
            $tier = 3;
        }

        $dbAddons = DB::table('user_addons')
            ->where('user_id', $user->id)
            ->get();

        $addonsMap = [];
        foreach ($dbAddons as $a) {
            $addonsMap[$a->addon_id] = $a;
        }

        $responseAddons = [];

        // 1. Addons Oficiais Anirium+ (exclusivos para Tier 2 e Tier 3)
        if ($tier >= 2) {
            $playerProRecord = $addonsMap['player-pro'] ?? null;
            $responseAddons[] = [
                'id' => 'player-pro',
                'name' => 'Anirium Player Pro',
                'version' => '1.0.0',
                'description' => 'Módulo externo de vídeo (episódios e filmes) Anirium+: conexões via Anirium+ Service, multi-áudio e legendas.',
                'author' => 'Anirium Core & TGCode',
                'category' => 'engine.renderer',
                'mediaType' => 'video',
                'type' => 'official-plus',
                'origin' => 'official',
                'entryScriptUrl' => config('services.addons.player_pro_bundle_url'),
                'embed_url' => 'https://godzlayer.github.io/anirium-embeds/video/',
                'repository_url' => config('services.addons.player_pro_repository_url'),
                'capabilities' => ['ui.player.render', 'playback.client', 'video.stream', 'subtitles.manage', 'audio.manage'],
                'enabled' => $playerProRecord ? (bool) $playerProRecord->enabled : true,
                'is_official' => true,
            ];

            $mangaReaderRecord = $addonsMap['manga-reader-pro'] ?? null;
            $responseAddons[] = [
                'id' => 'manga-reader-pro',
                'name' => 'Anirium Manga Reader Pro',
                'version' => '1.0.0',
                'description' => 'Módulo externo de leitura de capítulos de mangás e novels Anirium+ (imagens, CBZ e PDF).',
                'author' => 'Anirium Core & TGCode',
                'category' => 'engine.renderer',
                'mediaType' => 'manga',
                'type' => 'official-plus',
                'origin' => 'official',
                'entryScriptUrl' => config('services.addons.manga_reader_bundle_url'),
                'embed_url' => 'https://godzlayer.github.io/anirium-embeds/manga/',
                'repository_url' => config('services.addons.manga_reader_repository_url'),
                'capabilities' => ['ui.reader.render', 'manga.reader', 'document.pdf', 'document.images'],
                'enabled' => $mangaReaderRecord ? (bool) $mangaReaderRecord->enabled : false,
                'is_official' => true,
            ];
        }

        // 2. Addons Comunitários instalados na conta (Tier 1, 2 e 3)
        foreach ($dbAddons as $a) {
            if (in_array($a->addon_id, ['player-pro', 'manga-reader-pro'], true)) {
                continue;
            }

            $manifest = ! empty($a->manifest_json) ? json_decode($a->manifest_json, true) : null;
            $caps = $manifest['capabilities'] ?? [];
            if (empty($caps)) {
                $types = $manifest['types'] ?? [];
                $urlLower = strtolower(($a->manifest_url ?? '').' '.($a->name ?? ''));
                if (in_array('manga', $types, true) || in_array('comic', $types, true) || in_array('book', $types, true) || str_contains($urlLower, 'manga') || str_contains($urlLower, 'reader') || str_contains($urlLower, 'pdf')) {
                    $caps = ['manga.reader'];
                } else {
                    $caps = ['video.stream'];
                }
            }
            $responseAddons[] = [
                'id' => $a->addon_id,
                'name' => $a->name ?: ($manifest['name'] ?? $a->addon_id),
                'version' => $a->version ?: ($manifest['version'] ?? '1.0.0'),
                'description' => $manifest['description'] ?? 'Addon comunitário instalado pelo usuário.',
                'author' => $manifest['author'] ?? 'Comunidade',
                'category' => $manifest['category'] ?? null,
                'mediaType' => $manifest['mediaType'] ?? null,
                'entryScriptUrl' => $manifest['entryScriptUrl'] ?? ($manifest['entry_script_url'] ?? null),
                'type' => 'community',
                'origin' => 'community',
                'capabilities' => $caps,
                'manifest_url' => $a->manifest_url,
                'enabled' => (bool) $a->enabled,
                'is_official' => false,
            ];
        }

        return response()->json([
            'success' => true,
            'tier' => $tier,
            'addons' => $responseAddons,
        ]);
    }

    /**
     * Alterna o estado de ativação de um addon (enable/disable)
     */
    public function toggleUserAddon(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $request->validate(['addon_id' => 'required|string|max:100', 'enabled' => 'required|boolean']);
        $addonId = (string) $request->input('addon_id');
        $enabled = $request->boolean('enabled');

        if (! $addonId) {
            return response()->json(['error' => 'addon_id_required'], 422);
        }

        $tier = (int) ($user->tier ?? 1);
        if (strtolower($user->email ?? '') === 'santoss.cog@gmail.com') {
            $tier = 3;
        }

        // Addons Anirium+ não podem ser ativados por contas de Tier inferior a 2
        if (in_array($addonId, ['player-pro', 'manga-reader-pro'], true) && $tier < 2) {
            return response()->json(['error' => 'tier_unauthorized'], 403);
        }

        if (! in_array($addonId, ['player-pro', 'manga-reader-pro'], true) && ! DB::table('user_addons')->where('user_id', $user->id)->where('addon_id', $addonId)->exists()) {
            return response()->json(['error' => 'addon_not_installed'], 404);
        }

        DB::table('user_addons')->updateOrInsert(
            ['user_id' => $user->id, 'addon_id' => $addonId],
            [
                'enabled' => $enabled,
                'updated_at' => now(),
            ]
        );
        ServiceSessionSnapshot::forget((int) $user->id);
        app(RealtimeEventStore::class)->publish('user:'.$user->id, 'account.updated', [
            'reason' => 'addon_toggled',
            'addon_id' => $addonId,
            'enabled' => $enabled,
        ]);

        return response()->json(['success' => true, 'addon_id' => $addonId, 'enabled' => $enabled]);
    }

    /**
     * Instala um addon comunitário via URL de manifesto (ex.: Stremio) ou JSON
     */
    public function installUserAddon(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $request->validate([
            'manifest_url' => 'nullable|string|max:4096',
            'manifest' => 'nullable|array',
            'replace_addon_id' => 'nullable|string|max:100',
        ]);
        $manifestUrl = trim((string) $request->input('manifest_url'));
        $manifestData = $request->input('manifest');
        $replaceAddonId = trim((string) $request->input('replace_addon_id', ''));

        $manifestUrl = $manifestUrl ?: (string) ($manifestData['manifestUrl'] ?? '');
        if ($manifestUrl !== '') {
            $reference = RemoteAddonReference::fromUrl($manifestUrl);
            if ($reference === null) {
                return response()->json(['error' => 'invalid_manifest_url'], 422);
            }
            $manifestUrl = $reference['manifestUrl'];
            $manifestData = $reference;
        }

        if (! $manifestUrl && empty($manifestData)) {
            return response()->json(['error' => 'manifest_url_or_data_required'], 422);
        }

        $addonId = '';
        $name = '';
        $version = '1.0.0';

        if (! empty($manifestData) && is_array($manifestData)) {
            $addonId = (string) ($manifestData['id'] ?? '');
            $name = (string) ($manifestData['name'] ?? $addonId);
            $version = (string) ($manifestData['version'] ?? '1.0.0');
        } elseif ($manifestUrl) {
            // Resolver manifest URL (ex.: Stremio manifest.json)
            $addonId = 'addon-'.substr(md5($manifestUrl), 0, 10);
            $name = parse_url($manifestUrl, PHP_URL_HOST) ?: 'Addon Remoto';
        }

        if (! $addonId) {
            return response()->json(['error' => 'invalid_addon_id'], 422);
        }

        if ($addonId === 'player-pro' || ! preg_match('/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/', $addonId)) {
            return response()->json(['error' => 'invalid_addon_id'], 422);
        }
        if (! $manifestUrl && isset($manifestData['resources'])) {
            return response()->json(['error' => 'manifest_url_required'], 422);
        }

        DB::transaction(function () use ($user, $addonId, $name, $version, $manifestUrl, $manifestData, $replaceAddonId): void {
            DB::table('user_addons')->updateOrInsert(
                ['user_id' => $user->id, 'addon_id' => $addonId],
                [
                    'name' => $name,
                    'version' => $version,
                    'type' => 'community',
                    'manifest_url' => $manifestUrl ?: null,
                    'manifest_json' => ! empty($manifestData) ? json_encode($manifestData) : null,
                    'enabled' => true,
                    'updated_at' => now(),
                ]
            );

            if ($replaceAddonId !== '' && $replaceAddonId !== $addonId && ! in_array($replaceAddonId, ['player-pro', 'manga-reader-pro'], true)) {
                DB::table('user_addons')
                    ->where('user_id', $user->id)
                    ->where('addon_id', $replaceAddonId)
                    ->delete();
            }
        });
        ServiceSessionSnapshot::forget((int) $user->id);
        app(RealtimeEventStore::class)->publish('user:'.$user->id, 'account.updated', [
            'reason' => 'addon_installed',
            'addon_id' => $addonId,
        ]);

        return response()->json(['success' => true, 'addon_id' => $addonId]);
    }

    /**
     * Desinstala um addon comunitário
     */
    public function uninstallUserAddon(Request $request)
    {
        $user = Auth::user();
        if (! $user) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $addonId = (string) $request->input('addon_id');
        if (! $addonId || $addonId === 'player-pro') {
            return response()->json(['error' => 'cannot_uninstall_official_addon'], 400);
        }

        DB::table('user_addons')
            ->where('user_id', $user->id)
            ->where('addon_id', $addonId)
            ->delete();
        ServiceSessionSnapshot::forget((int) $user->id);
        app(RealtimeEventStore::class)->publish('user:'.$user->id, 'account.updated', [
            'reason' => 'addon_uninstalled',
            'addon_id' => $addonId,
        ]);

        return response()->json(['success' => true, 'uninstalled' => $addonId]);
    }
}
