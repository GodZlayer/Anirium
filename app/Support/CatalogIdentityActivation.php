<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogIdentityActivation
{
    public function __construct(private CatalogActivationSource $source, private CatalogDatabaseBackup $backup) {}

    public function run(string $path): array
    {
        $connection = DB::connection();
        if ($connection->getDriverName() !== 'sqlite' || ! is_file($path) || realpath($path) === realpath($connection->getDatabaseName())) {
            throw new DomainException('Activation requires a separate existing SQLite catalog candidate');
        }
        $pdo = $connection->getPdo();
        if ((int) $pdo->query('PRAGMA foreign_keys')->fetchColumn() !== 1) {
            throw new DomainException('Catalog activation requires foreign key enforcement');
        }
        if ($pdo->inTransaction() || (int) $pdo->query('SELECT count(*) FROM catalog_entities')->fetchColumn() !== 0) {
            throw new DomainException('Initial catalog activation requires an empty identity graph outside a transaction');
        }
        $attach = $pdo->prepare('ATTACH DATABASE ? AS identity_source');
        $attach->execute(['file:'.str_replace(['%', '?', '#'], ['%25', '%3F', '%23'], realpath($path)).'?mode=ro']);
        try {
            $pdo->exec('PRAGMA main.cache_size=-65536; PRAGMA identity_source.cache_size=-65536');
            $this->source->inspect($pdo);
            $backup = $this->backup->create();
            $pdo->exec('BEGIN IMMEDIATE');
            try {
                if ((int) $pdo->query('SELECT count(*) FROM main.catalog_entities')->fetchColumn() !== 0) {
                    throw new DomainException('Catalog identity graph changed during activation');
                }
                $receipt = $this->source->inspect($pdo);
                $counts = [];
                foreach (CatalogActivationSource::TABLES as $table) {
                    $counts[$table] = $pdo->exec('INSERT INTO main.'.$table.' SELECT * FROM identity_source.'.$table);
                }
                if ($pdo->query('PRAGMA main.foreign_key_check')->fetch() !== false) {
                    throw new DomainException('Activated catalog failed foreign key validation');
                }
                $pdo->exec('COMMIT');

                return [...$receipt, 'backup' => $backup, 'tables' => $counts];
            } catch (\Throwable $exception) {
                $pdo->exec('ROLLBACK');
                throw $exception;
            }
        } finally {
            $pdo->exec('DETACH DATABASE identity_source');
        }
    }
}
