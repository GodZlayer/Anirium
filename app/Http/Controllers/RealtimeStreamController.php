<?php

namespace App\Http\Controllers;

use App\Services\RealtimeEventStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\StreamedResponse;

class RealtimeStreamController extends Controller
{
    public function __construct(
        private readonly RealtimeEventStore $events,
    ) {}

    public function stream(Request $request): StreamedResponse
    {
        $user = Auth::user();
        $channels = ['global'];

        if ($user) {
            $channels[] = 'user:'.$user->id;
            if (method_exists($user, 'isAdmin') && $user->isAdmin()) {
                $channels[] = 'admin';
            }
        }

        $entityType = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $request->query('entity_type', ''));
        $entityId = trim((string) $request->query('entity_id', ''));
        if ($entityType !== '' && $entityId !== '' && strlen($entityId) <= 128) {
            $channels[] = "entity:{$entityType}:{$entityId}";
        }

        $roomCode = strtoupper(preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $request->query('room_code', '')));
        if ($roomCode !== '' && strlen($roomCode) <= 32) {
            $channels[] = "room:{$roomCode}";
        }

        $channels = array_values(array_unique($channels));

        $lastEventIdHeader = $request->header('Last-Event-ID');
        $lastEventIdQuery = $request->query('last_event_id');
        $hasCursor = ($lastEventIdHeader !== null && $lastEventIdHeader !== '')
            || ($lastEventIdQuery !== null && $lastEventIdQuery !== '');

        $cursor = $hasCursor
            ? max(0, (int) ($lastEventIdHeader ?? $lastEventIdQuery))
            : $this->events->latestId();

        $once = $request->boolean('once', false);
        $maxSeconds = $once ? 0 : max(5, min(30, (int) $request->query('window', 25)));

        // Release PHP session lock immediately so concurrent HTTP POST actions never block.
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        return response()->stream(function () use ($channels, $cursor, $maxSeconds, $once): void {
            if (function_exists('set_time_limit')) {
                @set_time_limit(0);
            }

            echo "retry: 1500\n\n";
            if (ob_get_level() > 0) {
                @ob_flush();
            }
            @flush();

            $startedAt = microtime(true);
            $lastPingAt = $startedAt;

            while (true) {
                $pending = $this->events->since($channels, $cursor, 50);

                foreach ($pending as $row) {
                    $cursor = (int) $row->id;
                    $eventName = preg_replace('/[^a-zA-Z0-9_.:-]/', '', (string) $row->event) ?: 'message';
                    $payload = is_string($row->payload) ? $row->payload : json_encode($row->payload);

                    echo "id: {$cursor}\n";
                    echo "event: {$eventName}\n";
                    echo "data: {$payload}\n\n";
                }

                if ($pending->isNotEmpty()) {
                    if (ob_get_level() > 0) {
                        @ob_flush();
                    }
                    @flush();
                }

                if ($once || (microtime(true) - $startedAt) >= $maxSeconds) {
                    break;
                }

                if (connection_aborted()) {
                    break;
                }

                if ((microtime(true) - $lastPingAt) >= 10.0) {
                    echo ": ping\n\n";
                    if (ob_get_level() > 0) {
                        @ob_flush();
                    }
                    @flush();
                    $lastPingAt = microtime(true);
                }

                usleep(400000);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-store, must-revalidate',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }
}
