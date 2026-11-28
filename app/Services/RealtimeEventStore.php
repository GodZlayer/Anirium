<?php

namespace App\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RealtimeEventStore
{
    private static ?bool $tableAvailable = null;

    /**
     * @param  array<string, mixed>  $payload
     */
    public function publish(string $channel, string $event, array $payload): int
    {
        if (! $this->isAvailable()) {
            return 0;
        }

        $id = (int) DB::table('realtime_events')->insertGetId([
            'channel' => $channel,
            'event' => $event,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'created_at' => now(),
        ]);

        if (random_int(1, 50) === 1) {
            $this->pruneOldEvents();
        }

        return $id;
    }

    /**
     * @param  array<int, string>  $channels
     * @return Collection<int, object>
     */
    public function since(array $channels, int $lastEventId = 0, int $limit = 50): Collection
    {
        if (! $this->isAvailable() || $channels === []) {
            return collect();
        }

        return DB::table('realtime_events')
            ->whereIn('channel', $channels)
            ->where('id', '>', $lastEventId)
            ->orderBy('id')
            ->limit($limit)
            ->get();
    }

    public function latestId(): int
    {
        if (! $this->isAvailable()) {
            return 0;
        }

        return (int) (DB::table('realtime_events')->max('id') ?? 0);
    }

    public function pruneOldEvents(int $minutes = 60): int
    {
        if (! $this->isAvailable()) {
            return 0;
        }

        return DB::table('realtime_events')
            ->where('created_at', '<', now()->subMinutes($minutes))
            ->delete();
    }

    public static function resetAvailabilityCache(): void
    {
        self::$tableAvailable = null;
    }

    private function isAvailable(): bool
    {
        if (self::$tableAvailable === null) {
            self::$tableAvailable = Schema::hasTable('realtime_events');
        }

        return self::$tableAvailable;
    }
}
