<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class CatalogDatabaseBackup
{
    public function create(): string
    {
        $connection = DB::connection();
        if ($connection->getDriverName() !== 'sqlite') {
            throw new DomainException('Use the database native backup before migrating this driver');
        }
        $directory = storage_path('app/catalog/database-backups');
        File::ensureDirectoryExists($directory);
        $path = $directory.'/'.now()->format('Ymd-His').'-'.Str::uuid().'.sqlite';
        $statement = $connection->getPdo()->prepare('VACUUM INTO ?');
        $statement->execute([$path]);
        $backup = new \PDO('sqlite:'.$path);
        if ($backup->query('PRAGMA integrity_check')->fetchColumn() !== 'ok') {
            throw new DomainException('Database backup failed integrity verification');
        }

        return $path;
    }
}
