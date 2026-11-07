<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Str;
use PDO;

class CatalogActivationSource
{
    public const TABLES = [
        'catalog_entities', 'catalog_entity_aliases', 'catalog_entity_titles', 'catalog_external_identities',
        'catalog_universes', 'catalog_works', 'catalog_universe_works', 'catalog_seasons', 'catalog_episodes',
        'catalog_arcs', 'catalog_arc_works', 'catalog_arc_episodes', 'catalog_work_relations',
        'catalog_registry_metadata', 'catalog_source_redirects', 'catalog_identity_imports', 'catalog_registry_adoptions',
    ];

    public function inspect(PDO $pdo): array
    {
        foreach (self::TABLES as $table) {
            $source = $pdo->query('PRAGMA identity_source.table_info("'.$table.'")')->fetchAll(PDO::FETCH_ASSOC);
            $target = $pdo->query('PRAGMA main.table_info("'.$table.'")')->fetchAll(PDO::FETCH_ASSOC);
            if ($source === [] || array_column($source, 'name') !== array_column($target, 'name')) {
                throw new DomainException('Incompatible catalog activation schema: '.$table);
            }
        }
        if ($pdo->query('PRAGMA identity_source.foreign_key_check')->fetch() !== false) {
            throw new DomainException('Candidate catalog has broken foreign keys');
        }
        $count = (int) $pdo->query('SELECT count(*) FROM identity_source.catalog_works')->fetchColumn();
        $receipt = $pdo->query('SELECT a.generation,a.registry_sha256,a.works FROM identity_source.catalog_registry_adoptions a JOIN identity_source.catalog_identity_imports i ON i.generation=a.generation WHERE i.complete=1 AND i.pending_relations=0 AND i.works=i.records AND i.relations=i.records AND a.works=i.works ORDER BY a.created_at DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
        if (! $receipt || $count === 0 || (int) $receipt['works'] !== $count || ! preg_match('/^[a-f0-9]{64}$/D', $receipt['registry_sha256'])) {
            throw new DomainException('Candidate requires a completed import and matching registry adoption');
        }
        $typedCount = 0;
        foreach (['universe' => 'catalog_universes', 'work' => 'catalog_works', 'season' => 'catalog_seasons', 'episode' => 'catalog_episodes', 'arc' => 'catalog_arcs'] as $kind => $table) {
            $typedCount += (int) $pdo->query('SELECT count(*) FROM identity_source.'.$table)->fetchColumn();
            $query = $pdo->prepare('SELECT 1 FROM identity_source.'.$table.' t LEFT JOIN identity_source.catalog_entities e ON e.id=t.id WHERE e.id IS NULL OR e.kind<>? OR e.resolution_status<>? LIMIT 1');
            $query->execute([$kind, 'verified']);
            if ($query->fetch() !== false) {
                throw new DomainException('Candidate catalog entity role mismatch: '.$kind);
            }
        }
        if ($typedCount !== (int) $pdo->query('SELECT count(*) FROM identity_source.catalog_entities')->fetchColumn()) {
            throw new DomainException('Candidate contains catalog identities without a typed record');
        }
        $entities = $pdo->query('SELECT id,kind,resolution_status FROM identity_source.catalog_entities');
        while ($entity = $entities->fetch(PDO::FETCH_ASSOC)) {
            if (! Str::isUuid($entity['id']) || ! in_array($entity['kind'], CatalogIdentityStore::KINDS, true) || $entity['resolution_status'] !== 'verified') {
                throw new DomainException('Candidate contains an invalid or unresolved catalog identity');
            }
        }
        if ($pdo->query('SELECT 1 FROM identity_source.catalog_works w WHERE NOT EXISTS (SELECT 1 FROM identity_source.catalog_universe_works m WHERE m.work_id=w.id) LIMIT 1')->fetch() !== false) {
            throw new DomainException('Candidate work is missing its SQL universe');
        }
        $aliases = $pdo->query('SELECT 1 FROM identity_source.catalog_entity_aliases a JOIN identity_source.catalog_entities e ON e.id=a.entity_id WHERE a.kind<>e.kind LIMIT 1');
        if ($aliases->fetch() !== false) {
            throw new DomainException('Candidate catalog alias role mismatch');
        }

        return ['generation' => $receipt['generation'], 'works' => $count, 'registry_sha256' => $receipt['registry_sha256']];
    }
}
