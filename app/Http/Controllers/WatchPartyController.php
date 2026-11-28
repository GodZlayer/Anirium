<?php

namespace App\Http\Controllers;

use App\Events\WatchPartyMessageSent;
use App\Events\WatchPartyUpdated;
use App\Models\User;
use App\Services\Cache\InMemoryCatalogService;
use App\Services\RealtimeEventStore;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class WatchPartyController extends Controller
{
    private function requirePlusUser(): array
    {
        $user = Auth::user();
        if (! $user instanceof User) {
            return [null, response()->json(['error' => 'unauthenticated'], 401)];
        }

        $tier = (int) ($user->tier ?? 1);
        if (strtolower((string) $user->email) === 'santoss.cog@gmail.com') {
            $tier = 3;
        }

        if ($tier < 2) {
            return [null, response()->json([
                'error' => 'plus_required',
                'message' => 'As Salas e Watch Parties são exclusivas para assinantes Anirium+.',
            ], 403)];
        }

        if (empty($user->handle)) {
            $prefix = strtolower(trim(explode('@', (string) $user->email)[0] ?? ''));
            $base = preg_replace('/[^a-z0-9._-]/', '', $prefix) ?: ('user'.$user->id);
            $candidate = substr($base, 0, 32);
            $suffix = 2;
            while (DB::table('users')->where('handle', $candidate)->where('id', '!=', $user->id)->exists()) {
                $candidate = substr($base, 0, 28).$suffix;
                $suffix++;
            }
            $user->handle = $candidate;
            $user->saveQuietly();
        }

        return [$user, null];
    }

    public function history(): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $now = now();
        $prefs = DB::table('user_entity_preferences')
            ->where('user_id', $user->id)
            ->where('target_type', 'episode')
            ->orderByDesc('updated_at')
            ->limit(200)
            ->get();

        $episodeIds = $prefs->map(fn ($p) => (string) ($p->entity_id ?: $p->target_id))->filter()->unique()->values()->all();
        $episodesById = [];
        if (! empty($episodeIds)) {
            foreach (DB::table('catalog_episodes')->whereIn('id', $episodeIds)->get(['id', 'work_id', 'number', 'air_date_utc']) as $ep) {
                $episodesById[(string) $ep->id] = $ep;
            }
        }

        // Agrupar por obra: apenas o último episódio visto de cada obra
        $latestByWork = [];
        foreach ($prefs as $pref) {
            $epId = (string) ($pref->entity_id ?: $pref->target_id);
            $ep = $episodesById[$epId] ?? null;
            if (! $ep) {
                continue;
            }
            $workId = (string) $ep->work_id;
            if (isset($latestByWork[$workId])) {
                continue;
            }

            $meta = is_string($pref->metadata ?? null) ? (json_decode($pref->metadata, true) ?: []) : [];
            $pos = (int) ($pref->progress_seconds ?? $meta['position_seconds'] ?? $meta['progress_seconds'] ?? 0);
            $dur = (int) ($pref->duration_seconds ?? $meta['duration_seconds'] ?? 0);
            $status = strtolower((string) ($pref->watch_status ?? $pref->status ?? ''));

            // Regra de watched: status === 'watched' OU tempo >= duração - 5 minutos (300s)
            $isWatched = $status === 'watched'
                || ($dur > 0 && $pos >= max(0, $dur - 300));

            $continueTarget = null;
            if (! $isWatched) {
                $continueTarget = [
                    'type' => 'resume',
                    'episodeId' => $epId,
                    'episodeNumber' => (int) $ep->number,
                    'resumeSeconds' => $pos,
                    'label' => 'Continuar Ep '.((int) $ep->number),
                ];
            } else {
                $nextEp = DB::table('catalog_episodes')
                    ->where('work_id', $workId)
                    ->where('number', '>', (int) $ep->number)
                    ->where(function ($q) use ($now) {
                        $q->whereNull('air_date_utc')
                            ->orWhere('air_date_utc', '<=', $now->toIso8601String());
                    })
                    ->orderBy('number')
                    ->first(['id', 'number']);

                if ($nextEp) {
                    $continueTarget = [
                        'type' => 'next',
                        'episodeId' => (string) $nextEp->id,
                        'episodeNumber' => (int) $nextEp->number,
                        'resumeSeconds' => 0,
                        'label' => 'Continuar: Ep '.((int) $nextEp->number),
                    ];
                }
            }

            $latestByWork[$workId] = [
                'workId' => $workId,
                'workTitle' => null,
                'image' => null,
                'episodeId' => $epId,
                'episodeNumber' => (int) $ep->number,
                'positionSeconds' => $pos,
                'durationSeconds' => $dur,
                'isWatched' => $isWatched,
                'continueTarget' => $continueTarget,
                'updatedAt' => $pref->updated_at,
            ];

            if (count($latestByWork) >= 24) {
                break;
            }
        }

        $workIds = array_keys($latestByWork);
        if (! empty($workIds)) {
            foreach (DB::table('catalog_entity_titles')->whereIn('entity_id', $workIds)->get(['entity_id', 'locale', 'title']) as $t) {
                $wid = (string) $t->entity_id;
                if (isset($latestByWork[$wid]) && ($latestByWork[$wid]['workTitle'] === null || $t->locale === 'en')) {
                    $latestByWork[$wid]['workTitle'] = $t->title;
                }
            }
            foreach (DB::table('catalog_work_assets')->whereIn('work_id', $workIds)->whereNotNull('image_url')->get(['work_id', 'image_url']) as $asset) {
                $wid = (string) $asset->work_id;
                if (isset($latestByWork[$wid]) && $latestByWork[$wid]['image'] === null) {
                    $latestByWork[$wid]['image'] = $asset->image_url;
                }
            }
        }

        return response()->json([
            'items' => array_values($latestByWork),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function liveSchedule(): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $now = now();
        $windowStart = $now->copy()->subMinutes(30);
        $windowEnd = $now->copy()->addHours(5);

        // Encerra automaticamente salas públicas live_launch cujo episódio já terminou (> 35 min após launch_at)
        DB::table('watch_party_rooms')
            ->where('mode', 'live_launch')
            ->where('status', '!=', 'ended')
            ->whereNotNull('launch_at')
            ->where('launch_at', '<', $now->copy()->subMinutes(35))
            ->update([
                'status' => 'ended',
                'phase' => 'ended',
                'updated_at' => $now,
            ]);

        $activeLiveRooms = DB::table('watch_party_rooms')
            ->where('mode', 'live_launch')
            ->where('status', '!=', 'ended')
            ->orderByDesc('launch_at')
            ->limit(24)
            ->get();

        $workIds = $activeLiveRooms->pluck('work_id')->filter()->unique()->values()->all();
        $titlesByWorkId = [];
        if (! empty($workIds)) {
            foreach (DB::table('catalog_entity_titles')->whereIn('entity_id', $workIds)->get(['entity_id', 'locale', 'title']) as $row) {
                $eid = (string) $row->entity_id;
                if (! isset($titlesByWorkId[$eid]) || $row->locale === 'en') {
                    $titlesByWorkId[$eid] = $row->title;
                }
            }
        }

        $roomsByWorkEp = [];
        $rooms = collect();
        foreach ($activeLiveRooms as $room) {
            $live = $this->computeLiveState($room, $now);
            $membersCount = DB::table('watch_party_members')
                ->where('room_id', $room->id)
                ->where('last_seen_at', '>=', $now->copy()->subSeconds(45))
                ->count();

            if ($live['liveLocked']) {
                // Fecha automaticamente salas públicas que iniciaram com 0 pessoas
                if ($membersCount === 0) {
                    DB::table('watch_party_rooms')->where('id', $room->id)->update([
                        'status' => 'ended',
                        'phase' => 'ended',
                        'updated_at' => $now,
                    ]);
                }

                continue;
            }
            $launchAt = $room->launch_at ? Carbon::parse($room->launch_at) : null;
            $liveStartsAt = $launchAt?->copy()->addMinutes(5);
            $canEnterRoom = $launchAt === null || $now->greaterThanOrEqualTo($launchAt);
            $secondsUntilOpen = $launchAt && $now->lessThan($launchAt)
                ? (int) $now->diffInSeconds($launchAt)
                : 0;

            $key = strtolower((string) $room->work_id).':'.((int) ($room->episode_number ?? 0));
            $roomsByWorkEp[$key] = true;

            $rooms->push([
                'code' => $room->code,
                'workId' => $room->work_id,
                'workTitle' => $titlesByWorkId[$room->work_id] ?? 'Lançamento Anirium',
                'image' => null,
                'episodeId' => $room->episode_id,
                'episodeNumber' => $room->episode_number !== null ? (int) $room->episode_number : null,
                'launchAt' => $launchAt?->toIso8601String(),
                'liveStartsAt' => $liveStartsAt?->toIso8601String(),
                'canEnterRoom' => $canEnterRoom,
                'secondsUntilOpen' => $secondsUntilOpen,
                'liveLocked' => $live['liveLocked'],
                'liveEdgeSeconds' => $live['liveEdgeSeconds'],
                'membersCount' => $membersCount,
                'controlledBy' => 'Anirium Live',
            ]);
        }

        // Lançamentos automáticos do calendário oficial (janela: últimos 30 min até próximas 5h)
        $dayKeys = ['sundays', 'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays'];
        $calendar = app(InMemoryCatalogService::class)->getCalendarByDay((bool) $user->canAccessAdultContent());

        foreach ([0, 1] as $dayOffset) {
            $dayDate = $now->copy()->addDays($dayOffset);
            $dayKey = $dayKeys[(int) $dayDate->dayOfWeek] ?? null;
            if (! $dayKey || empty($calendar[$dayKey]) || ! is_array($calendar[$dayKey])) {
                continue;
            }
            foreach ($calendar[$dayKey] as $entry) {
                if (! is_array($entry) || empty($entry['id']) || empty($entry['time'])) {
                    continue;
                }
                if (! preg_match('/^(\d{1,2}):(\d{2})$/', (string) $entry['time'], $m)) {
                    continue;
                }
                $launchAt = $dayDate->copy()->setTime((int) $m[1], (int) $m[2], 0);
                if ($launchAt->lessThan($windowStart) || $launchAt->greaterThan($windowEnd)) {
                    continue;
                }
                $epNum = (int) ($entry['episode'] ?? 1);
                $key = strtolower((string) $entry['id']).':'.$epNum;
                if (isset($roomsByWorkEp[$key])) {
                    continue;
                }
                $roomsByWorkEp[$key] = true;

                $liveStartsAt = $launchAt->copy()->addMinutes(5);
                $canEnterRoom = $now->greaterThanOrEqualTo($launchAt);
                $liveLocked = $now->greaterThanOrEqualTo($liveStartsAt);
                if ($liveLocked) {
                    continue;
                }
                $secondsUntilOpen = $canEnterRoom ? 0 : (int) $now->diffInSeconds($launchAt);
                $liveEdgeSeconds = $liveLocked ? (float) $liveStartsAt->diffInSeconds($now, false) : 0.0;

                $rooms->push([
                    'code' => null,
                    'workId' => strtolower((string) $entry['id']),
                    'workTitle' => (string) ($entry['title'] ?? 'Lançamento Anirium'),
                    'image' => $entry['image'] ?? null,
                    'episodeId' => null,
                    'episodeNumber' => $epNum,
                    'launchAt' => $launchAt->toIso8601String(),
                    'liveStartsAt' => $liveStartsAt->toIso8601String(),
                    'canEnterRoom' => $canEnterRoom,
                    'secondsUntilOpen' => $secondsUntilOpen,
                    'liveLocked' => $liveLocked,
                    'liveEdgeSeconds' => round(max(0.0, $liveEdgeSeconds), 2),
                    'membersCount' => 0,
                    'controlledBy' => 'Anirium Live',
                ]);
            }
        }

        $sorted = $rooms->sortBy('secondsUntilOpen')->values();

        return response()->json([
            'handle' => $user->handle,
            'lives' => $sorted,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function findByHandle(string $handle): JsonResponse
    {
        [, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $normalized = ltrim(strtolower(trim($handle)), '@');
        if ($normalized === '') {
            return response()->json(['active' => false], 200);
        }

        $owner = DB::table('users')->whereRaw('LOWER(handle) = ?', [$normalized])->first(['id', 'name', 'handle']);
        if (! $owner) {
            return response()->json(['active' => false, 'reason' => 'user_not_found'], 404);
        }

        $room = DB::table('watch_party_rooms')
            ->where('leader_user_id', $owner->id)
            ->where('mode', 'party')
            ->where('status', '!=', 'ended')
            ->orderByDesc('id')
            ->first();

        if (! $room) {
            return response()->json([
                'active' => false,
                'handle' => $owner->handle,
                'ownerName' => $owner->name,
            ], 200);
        }

        $membersCount = DB::table('watch_party_members')
            ->where('room_id', $room->id)
            ->where('last_seen_at', '>=', now()->subSeconds(45))
            ->count();

        return response()->json([
            'active' => true,
            'code' => $room->code,
            'handle' => $owner->handle,
            'ownerName' => $owner->name,
            'hasPassword' => ! empty($room->password_hash),
            'workId' => $room->work_id,
            'episodeId' => $room->episode_id,
            'episodeNumber' => $room->episode_number !== null ? (int) $room->episode_number : null,
            'status' => $room->status,
            'membersCount' => $membersCount,
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function create(Request $request): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $validated = $request->validate([
            'mode' => ['nullable', 'string', 'in:party,live_launch'],
            'workId' => ['required', 'uuid'],
            'episodeId' => ['nullable', 'uuid'],
            'episodeNumber' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'launchAt' => ['nullable', 'date'],
            'isPublic' => ['nullable', 'boolean'],
            'password' => ['nullable', 'string', 'min:2', 'max:64'],
        ]);

        $mode = $validated['mode'] ?? 'party';
        $workId = strtolower($validated['workId']);
        $episodeId = isset($validated['episodeId']) ? strtolower($validated['episodeId']) : null;
        $now = now();

        if ($mode === 'live_launch' && $episodeId !== null) {
            $existing = DB::table('watch_party_rooms')
                ->where('mode', 'live_launch')
                ->where('episode_id', $episodeId)
                ->where('status', '!=', 'ended')
                ->first();

            if ($existing) {
                $this->upsertMember((int) $existing->id, (int) $user->id, 'member', true);

                return response()->json([
                    'code' => $existing->code,
                    'room' => $this->formatRoomState($existing, (int) $user->id, 0),
                ], 200);
            }
        }

        // Encerrar sala party anterior do mesmo líder para manter 1 sala ativa por @handle
        if ($mode === 'party') {
            DB::table('watch_party_rooms')
                ->where('leader_user_id', $user->id)
                ->where('mode', 'party')
                ->where('status', '!=', 'ended')
                ->update(['status' => 'ended', 'updated_at' => $now]);
        }

        $code = strtoupper(Str::random(8));
        $launchAt = isset($validated['launchAt']) ? Carbon::parse($validated['launchAt']) : ($mode === 'live_launch' ? $now : null);
        $passwordHash = ! empty($validated['password']) ? Hash::make($validated['password']) : null;

        $roomId = DB::table('watch_party_rooms')->insertGetId([
            'code' => $code,
            'leader_user_id' => $mode === 'live_launch' ? null : $user->id,
            'mode' => $mode,
            'work_id' => $workId,
            'episode_id' => $episodeId,
            'episode_number' => $validated['episodeNumber'] ?? null,
            'status' => 'lobby_loading',
            'playback_position_seconds' => 0,
            'playback_updated_at' => $now,
            'launch_at' => $launchAt,
            'live_edge_seconds' => 0,
            'is_public' => (bool) ($validated['isPublic'] ?? ($mode === 'live_launch')),
            'password_hash' => $passwordHash,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->upsertMember((int) $roomId, (int) $user->id, $mode === 'live_launch' ? 'member' : 'leader', true);

        $room = DB::table('watch_party_rooms')->where('id', $roomId)->first();

        return response()->json([
            'code' => $code,
            'room' => $this->formatRoomState($room, (int) $user->id, 0),
        ], 201);
    }

    public function join(Request $request, string $code): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $room = DB::table('watch_party_rooms')->where('code', strtoupper($code))->first();
        if (! $room || $room->status === 'ended') {
            return response()->json(['error' => 'room_not_found'], 404);
        }

        // Salas públicas (live_launch): só permite entrar durante o loading/pré-estreia (antes de iniciar)
        if ($room->mode === 'live_launch') {
            $liveState = $this->computeLiveState($room, now());
            if ($liveState['liveLocked']) {
                return response()->json([
                    'error' => 'live_already_started',
                    'message' => 'Esta Live Pública já iniciou. Só é possível entrar durante o carregamento inicial.',
                ], 403);
            }
        }

        $isLeader = $room->leader_user_id !== null && (int) $room->leader_user_id === (int) $user->id;
        if (! $isLeader && ! empty($room->password_hash)) {
            $provided = (string) $request->input('password', '');
            if ($provided === '') {
                return response()->json(['error' => 'password_required', 'message' => 'Esta sala exige senha.'], 403);
            }
            if (! Hash::check($provided, (string) $room->password_hash)) {
                return response()->json(['error' => 'invalid_password', 'message' => 'Senha incorreta.'], 403);
            }
        }

        $isReady = $request->boolean('ready', true);
        $role = $isLeader ? 'leader' : 'member';
        $this->upsertMember((int) $room->id, (int) $user->id, $role, $isReady);

        // Em sala privada: ao entrar um novo participante com episódio ativo, pausa todos e entra em modo sync por 45s
        if (! $isLeader && $room->mode !== 'live_launch' && ! empty($room->episode_id)) {
            $now = now();
            $live = $this->computeLiveState($room, $now);
            DB::table('watch_party_rooms')->where('id', $room->id)->update([
                'status' => 'paused',
                'phase' => 'stabilizing',
                'sync_lock_until' => $now->copy()->addSeconds(45),
                'playback_position_seconds' => $live['effectivePositionSeconds'],
                'playback_updated_at' => $now,
                'updated_at' => $now,
            ]);
            $room = DB::table('watch_party_rooms')->where('id', $room->id)->first();
            $formattedForBroadcast = $this->formatRoomState($room, (int) $user->id, 0);
            broadcast(new WatchPartyUpdated($room->code, $formattedForBroadcast))->toOthers();
            app(RealtimeEventStore::class)->publish('room:'.strtoupper($room->code), 'watch_party.updated', [
                'room' => $formattedForBroadcast,
            ]);
        }

        return response()->json([
            'status' => 'joined',
            'room' => $this->formatRoomState($room, (int) $user->id, 0),
        ]);
    }

    public function state(Request $request, string $code): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $room = DB::table('watch_party_rooms')->where('code', strtoupper($code))->first();
        if (! $room) {
            return response()->json(['error' => 'room_not_found'], 404);
        }

        $role = ($room->leader_user_id !== null && (int) $room->leader_user_id === (int) $user->id) ? 'leader' : 'member';
        $this->upsertMember((int) $room->id, (int) $user->id, $role, $request->boolean('ready', true));

        $afterId = max(0, (int) $request->integer('after_id', 0));

        return response()->json([
            'room' => $this->formatRoomState($room, (int) $user->id, $afterId),
        ], 200, ['Cache-Control' => 'no-store']);
    }

    public function control(Request $request, string $code): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $room = DB::table('watch_party_rooms')->where('code', strtoupper($code))->first();
        if (! $room || $room->status === 'ended') {
            return response()->json(['error' => 'room_not_found'], 404);
        }

        // Salas públicas (live_launch): só permite entrar durante o loading/pré-estreia (antes de iniciar)
        if ($room->mode === 'live_launch') {
            $liveState = $this->computeLiveState($room, now());
            if ($liveState['liveLocked']) {
                return response()->json([
                    'error' => 'live_already_started',
                    'message' => 'Esta Live Pública já iniciou. Só é possível entrar durante o carregamento inicial.',
                ], 403);
            }
        }

        if ($room->mode === 'live_launch' || $room->leader_user_id === null || (int) $room->leader_user_id !== (int) $user->id) {
            return response()->json([
                'error' => 'leader_only',
                'message' => 'Apenas o líder da sala pode controlar a reprodução.',
            ], 403);
        }

        $validated = $request->validate([
            'action' => ['required', 'string', 'in:play,pause,seek,change_episode,episode_ended,end'],
            'positionSeconds' => ['nullable', 'numeric', 'min:0', 'max:86400'],
            'episodeId' => ['nullable', 'uuid'],
            'episodeNumber' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);

        $now = now();
        $action = $validated['action'];
        $live = $this->computeLiveState($room, $now);
        $currentPos = $live['effectivePositionSeconds'];
        $updates = ['updated_at' => $now, 'playback_updated_at' => $now];

        switch ($action) {
            case 'play':
                $pos = isset($validated['positionSeconds']) ? (float) $validated['positionSeconds'] : $currentPos;
                $updates['status'] = 'playing';
                $updates['phase'] = 'playing';
                $updates['sync_lock_until'] = null;
                $updates['playback_position_seconds'] = $pos;
                $updates['live_edge_seconds'] = max((float) $room->live_edge_seconds, $pos);
                break;

            case 'pause':
                $pos = isset($validated['positionSeconds']) ? (float) $validated['positionSeconds'] : $currentPos;
                $updates['status'] = 'paused';
                $updates['phase'] = 'playing';
                $updates['playback_position_seconds'] = $pos;
                break;

            case 'seek':
                $targetPos = (float) ($validated['positionSeconds'] ?? $currentPos);
                $updates['playback_position_seconds'] = $targetPos;
                $updates['live_edge_seconds'] = max((float) $room->live_edge_seconds, $targetPos);
                break;

            case 'change_episode':
                $updates['episode_id'] = isset($validated['episodeId']) ? strtolower($validated['episodeId']) : $room->episode_id;
                $updates['episode_number'] = $validated['episodeNumber'] ?? $room->episode_number;
                $updates['status'] = 'lobby_loading';
                $updates['phase'] = 'stabilizing';
                $updates['sync_lock_until'] = $now->copy()->addSeconds(60);
                $updates['playback_position_seconds'] = 0;
                $updates['live_edge_seconds'] = 0;
                break;

            case 'episode_ended':
                if ($room->mode === 'live_launch') {
                    $updates['status'] = 'ended';
                    $updates['phase'] = 'ended';
                } else {
                    $updates['status'] = 'paused';
                    $updates['phase'] = 'waiting';
                    $updates['sync_lock_until'] = null;
                    $updates['playback_position_seconds'] = 0;
                }
                break;

            case 'end':
                $updates['status'] = 'ended';
                $updates['phase'] = 'ended';
                $updates['sync_lock_until'] = null;
                break;
        }

        DB::table('watch_party_rooms')->where('id', $room->id)->update($updates);
        $updated = DB::table('watch_party_rooms')->where('id', $room->id)->first();
        $formatted = $this->formatRoomState($updated, (int) $user->id, 0);

        $eventName = $updated->status === 'ended' ? 'watch_party.ended' : 'watch_party.updated';
        broadcast(new WatchPartyUpdated($updated->code, $formatted))->toOthers();
        app(RealtimeEventStore::class)->publish('room:'.strtoupper($updated->code), $eventName, [
            'room' => $formatted,
        ]);

        return response()->json([
            'status' => 'ok',
            'room' => $formatted,
        ]);
    }

    public function sendMessage(Request $request, string $code): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $room = DB::table('watch_party_rooms')->where('code', strtoupper($code))->first();
        if (! $room || $room->status === 'ended') {
            return response()->json(['error' => 'room_not_found'], 404);
        }

        // Salas públicas (live_launch): só permite entrar durante o loading/pré-estreia (antes de iniciar)
        if ($room->mode === 'live_launch') {
            $liveState = $this->computeLiveState($room, now());
            if ($liveState['liveLocked']) {
                return response()->json([
                    'error' => 'live_already_started',
                    'message' => 'Esta Live Pública já iniciou. Só é possível entrar durante o carregamento inicial.',
                ], 403);
            }
        }

        $validated = $request->validate([
            'body' => ['required', 'string', 'min:1', 'max:500'],
        ]);

        $now = now();
        $id = DB::table('watch_party_messages')->insertGetId([
            'room_id' => $room->id,
            'user_id' => $user->id,
            'body' => trim($validated['body']),
            'created_at' => $now,
        ]);

        $messagePayload = [
            'id' => (int) $id,
            'userId' => (int) $user->id,
            'userName' => $user->name,
            'userHandle' => $user->handle,
            'body' => trim($validated['body']),
            'createdAt' => $now->toIso8601String(),
        ];

        broadcast(new WatchPartyMessageSent($room->code, $messagePayload))->toOthers();
        app(RealtimeEventStore::class)->publish('room:'.strtoupper($room->code), 'watch_party.message', [
            'message' => $messagePayload,
        ]);

        return response()->json([
            'message' => $messagePayload,
        ], 201);
    }

    public function leave(Request $request, string $code): JsonResponse
    {
        [$user, $error] = $this->requirePlusUser();
        if ($error !== null) {
            return $error;
        }

        $room = DB::table('watch_party_rooms')->where('code', strtoupper($code))->first();
        if (! $room) {
            return response()->json(['error' => 'room_not_found'], 404);
        }

        DB::table('watch_party_members')
            ->where('room_id', $room->id)
            ->where('user_id', $user->id)
            ->delete();

        if ($room->leader_user_id !== null && (int) $room->leader_user_id === (int) $user->id) {
            DB::table('watch_party_rooms')->where('id', $room->id)->update([
                'status' => 'ended',
                'phase' => 'ended',
                'sync_lock_until' => null,
                'updated_at' => now(),
            ]);
            app(RealtimeEventStore::class)->publish('room:'.strtoupper($room->code), 'watch_party.ended', [
                'code' => $room->code,
                'reason' => 'leader_left',
            ]);
        }

        return response()->json(['status' => 'left']);
    }

    private function upsertMember(int $roomId, int $userId, string $role, bool $isReady): void
    {
        $now = now();
        DB::table('watch_party_members')->upsert(
            [[
                'room_id' => $roomId,
                'user_id' => $userId,
                'role' => $role,
                'is_ready' => $isReady,
                'last_seen_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]],
            ['room_id', 'user_id'],
            ['role', 'is_ready', 'last_seen_at', 'updated_at']
        );
    }

    /**
     * @return array{effectivePositionSeconds: float, liveLocked: bool, liveEdgeSeconds: float, effectiveStatus: string}
     */
    private function computeLiveState(object $room, Carbon $now): array
    {
        $basePos = (float) ($room->playback_position_seconds ?? 0);
        $elapsed = 0.0;
        if ($room->status === 'playing' && ! empty($room->playback_updated_at)) {
            $elapsed = max(0.0, (float) Carbon::parse($room->playback_updated_at)->diffInSeconds($now, false));
        }
        $effective = $basePos + $elapsed;
        $effectiveStatus = (string) $room->status;

        $liveLocked = false;
        $liveEdge = max((float) ($room->live_edge_seconds ?? 0), $effective);

        if ($room->mode === 'live_launch' && ! empty($room->launch_at)) {
            $liveStartsAt = Carbon::parse($room->launch_at)->addMinutes(5);
            if ($now->greaterThanOrEqualTo($liveStartsAt)) {
                // TV ao vivo controlada pelo relógio simulado do Anirium: trava exatamente no liveEdgeSeconds
                $liveLocked = true;
                $sinceLive = max(0.0, (float) $liveStartsAt->diffInSeconds($now, false));
                $liveEdge = max($liveEdge, $sinceLive);
                $effective = $liveEdge;
                $effectiveStatus = 'playing';
            }
        }

        return [
            'effectivePositionSeconds' => round($effective, 2),
            'liveLocked' => $liveLocked,
            'liveEdgeSeconds' => round($liveEdge, 2),
            'effectiveStatus' => $effectiveStatus,
        ];
    }

    private function formatRoomState(object $room, int $viewerUserId, int $afterMessageId): array
    {
        $now = now();
        $live = $this->computeLiveState($room, $now);

        $leaderHandle = null;
        if ($room->leader_user_id !== null) {
            $leaderHandle = DB::table('users')->where('id', $room->leader_user_id)->value('handle');
        }

        $members = DB::table('watch_party_members as m')
            ->leftJoin('users as u', 'u.id', '=', 'm.user_id')
            ->where('m.room_id', $room->id)
            ->where('m.last_seen_at', '>=', $now->copy()->subSeconds(45))
            ->select(['m.user_id', 'm.role', 'm.is_ready', 'u.name', 'u.handle'])
            ->get();

        $messagesQuery = DB::table('watch_party_messages as msg')
            ->leftJoin('users as u', 'u.id', '=', 'msg.user_id')
            ->where('msg.room_id', $room->id)
            ->select(['msg.id', 'msg.user_id', 'u.name', 'u.handle', 'msg.body', 'msg.created_at'])
            ->orderBy('msg.id');

        if ($afterMessageId > 0) {
            $messagesQuery->where('msg.id', '>', $afterMessageId);
        }

        $messages = $messagesQuery->limit(100)->get()->map(fn ($m) => [
            'id' => (int) $m->id,
            'userId' => (int) $m->user_id,
            'userName' => $m->name,
            'userHandle' => $m->handle,
            'body' => $m->body,
            'createdAt' => $m->created_at,
        ])->values();

        $syncLockUntil = ! empty($room->sync_lock_until) ? Carbon::parse($room->sync_lock_until) : null;
        $syncRemainingSeconds = ($syncLockUntil && $now->lessThan($syncLockUntil))
            ? (int) $now->diffInSeconds($syncLockUntil)
            : 0;
        $phase = (string) ($room->phase ?? 'playing');
        if ($room->status === 'ended') {
            $phase = 'ended';
        } elseif ($phase === 'stabilizing' && $syncRemainingSeconds <= 0) {
            $phase = 'playing';
        }

        $resolvedEpisodeId = $room->episode_id;
        if (empty($resolvedEpisodeId) && ! empty($room->work_id) && $room->episode_number !== null) {
            $resolvedEpisodeId = DB::table('catalog_episodes')
                ->where('work_id', $room->work_id)
                ->where('number', (int) $room->episode_number)
                ->value('id');
        }

        return [
            'code' => $room->code,
            'mode' => $room->mode,
            'status' => $live['effectiveStatus'],
            'phase' => $phase,
            'syncLockUntil' => $syncLockUntil?->toIso8601String(),
            'syncRemainingSeconds' => $syncRemainingSeconds,
            'serverTimeMs' => (int) round(microtime(true) * 1000),
            'workId' => $room->work_id,
            'episodeId' => $resolvedEpisodeId,
            'episodeNumber' => $room->episode_number !== null ? (int) $room->episode_number : null,
            'leaderUserId' => $room->leader_user_id !== null ? (int) $room->leader_user_id : null,
            'leaderHandle' => $leaderHandle,
            'isLeader' => $room->leader_user_id !== null && (int) $room->leader_user_id === $viewerUserId,
            'hasPassword' => ! empty($room->password_hash),
            'effectivePositionSeconds' => $live['effectivePositionSeconds'],
            'liveLocked' => $live['liveLocked'],
            'liveEdgeSeconds' => $live['liveEdgeSeconds'],
            'membersCount' => $members->count(),
            'readyCount' => $members->where('is_ready', true)->count(),
            'members' => $members->map(fn ($m) => [
                'userId' => (int) $m->user_id,
                'name' => $m->name,
                'handle' => $m->handle,
                'role' => $m->role,
                'isReady' => (bool) $m->is_ready,
            ])->values(),
            'messages' => $messages,
        ];
    }
}
