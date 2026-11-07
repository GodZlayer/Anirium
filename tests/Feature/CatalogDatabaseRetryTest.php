<?php

namespace Tests\Feature;

use App\Support\CatalogDatabaseRetry;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use PDO;
use Tests\TestCase;

class CatalogDatabaseRetryTest extends TestCase
{
    public function test_a_real_sqlite_write_lock_is_retried_without_duplicate_writes(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'catalog-lock-');
        config(['database.connections.lock_probe' => ['driver' => 'sqlite', 'database' => $path, 'prefix' => '', 'busy_timeout' => 1]]);
        $locker = new PDO('sqlite:'.$path);
        $locker->exec('CREATE TABLE entries(id INTEGER PRIMARY KEY); BEGIN IMMEDIATE');
        $retry = new class($locker) extends CatalogDatabaseRetry
        {
            public function __construct(private PDO $locker) {}

            protected function pause(int $attempt): void
            {
                $this->locker->exec('COMMIT');
            }
        };
        $attempts = 0;
        try {
            $retry->run(function () use (&$attempts): void {
                $attempts++;
                DB::connection('lock_probe')->transaction(fn () => DB::connection('lock_probe')->table('entries')->insert(['id' => 1]));
            });
            $this->assertSame(2, $attempts);
            $this->assertSame(1, DB::connection('lock_probe')->table('entries')->count());
        } finally {
            DB::purge('lock_probe');
            unset($retry, $locker);
            @unlink($path);
        }
    }

    public function test_a_non_lock_database_failure_is_not_retried(): void
    {
        $attempts = 0;
        try {
            app(CatalogDatabaseRetry::class)->run(function () use (&$attempts): void {
                $attempts++;
                DB::statement('SELECT * FROM missing_catalog_retry_probe');
            });
            $this->fail('Invalid SQL was accepted');
        } catch (QueryException) {
            $this->assertSame(1, $attempts);
        }
    }

    public function test_wal_keeps_a_committed_read_snapshot_available_during_a_write(): void
    {
        File::ensureDirectoryExists(storage_path('framework/testing'));
        $path = storage_path('framework/testing/catalog-wal-'.Str::uuid().'.sqlite');
        $writer = new PDO('sqlite:'.$path);
        $this->assertSame('wal', $writer->query('PRAGMA journal_mode=WAL')->fetchColumn());
        $writer->exec('CREATE TABLE entries(id INTEGER PRIMARY KEY); INSERT INTO entries VALUES(1)');
        $reader = new PDO('sqlite:'.$path);
        try {
            $writer->exec('BEGIN IMMEDIATE; INSERT INTO entries VALUES(2)');
            $this->assertSame(1, (int) $reader->query('SELECT count(*) FROM entries')->fetchColumn());
            $writer->exec('COMMIT');
            $this->assertSame(2, (int) $reader->query('SELECT count(*) FROM entries')->fetchColumn());
        } finally {
            unset($reader, $writer);
            @unlink($path);
            @unlink($path.'-wal');
            @unlink($path.'-shm');
        }
    }
}
