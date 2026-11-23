<?php

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use PDOException;
use Throwable;

class ServiceSessionSnapshot
{
    private const int TTL_SECONDS = 300;

    /**
     * Build the cache key storing the last validated authorization snapshot for an account.
     */
    public static function key(int $accountId): string
    {
        return "anirium_service_auth_snapshot_v1:{$accountId}";
    }

    /**
     * Retrieve a cached authorization snapshot for an account when present.
     *
     * @return array{
     *     accountId: string,
     *     level: int,
     *     authorizedAddonIds: list<string>,
     *     installedAddons: list<array<string, mixed>>
     * }|null
     */
    public static function get(int $accountId): ?array
    {
        $snapshot = Cache::get(self::key($accountId));

        return is_array($snapshot) ? $snapshot : null;
    }

    /**
     * Persist the latest validated authorization snapshot in cache for transient DB contention recovery.
     *
     * @param  array{
     *     accountId: string,
     *     level: int,
     *     authorizedAddonIds: list<string>,
     *     installedAddons: list<array<string, mixed>>
     * }  $payload
     */
    public static function put(int $accountId, array $payload): void
    {
        Cache::put(self::key($accountId), $payload, self::TTL_SECONDS);
    }

    /**
     * Remove any cached authorization snapshot so tier downgrades or addon changes take effect immediately.
     */
    public static function forget(int $accountId): void
    {
        Cache::forget(self::key($accountId));
    }

    /**
     * Determine whether an exception represents SQLite lock or busy contention.
     */
    public static function isSqliteBusy(Throwable $exception): bool
    {
        $current = $exception;

        while ($current !== null) {
            if ($current instanceof QueryException || $current instanceof PDOException) {
                $driverCode = (int) ($current->errorInfo[1] ?? 0);
                if (in_array($driverCode, [5, 6], true) || (string) $current->getCode() === '5') {
                    return true;
                }
            }

            $message = strtolower($current->getMessage());
            foreach (['database is locked', 'database table is locked', 'sqlite_busy', 'sqlite_locked', 'general error: 5', 'general error: 6'] as $needle) {
                if (str_contains($message, $needle)) {
                    return true;
                }
            }

            $current = $current->getPrevious();
        }

        return false;
    }

    /**
     * Execute a database callback under a bounded SQLite busy timeout, restoring the configured timeout afterward.
     *
     * @template TReturn
     *
     * @param  callable(): TReturn  $callback
     * @return TReturn
     */
    public static function withShortSqliteBusyTimeout(int $timeoutMs, callable $callback): mixed
    {
        $connection = DB::connection();
        if ($connection->getDriverName() !== 'sqlite') {
            return $callback();
        }

        $previousTimeout = max(0, (int) config('database.connections.sqlite.busy_timeout', 30000));
        $targetTimeout = max(0, $timeoutMs);
        $connection->statement("PRAGMA busy_timeout = {$targetTimeout}");

        try {
            return $callback();
        } finally {
            try {
                $connection->statement("PRAGMA busy_timeout = {$previousTimeout}");
            } catch (Throwable) {
                // Preserve any exception propagating from the callback.
            }
        }
    }
}
