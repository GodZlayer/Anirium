<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CatalogIdentityStore
{
    public const KINDS = ['universe', 'work', 'manga', 'season', 'episode', 'arc', 'creator', 'studio', 'track'];

    public function create(string $kind, array $aliases = [], ?string $id = null, string $status = 'verified'): string
    {
        if (! in_array($kind, self::KINDS, true) || ! in_array($status, ['verified', 'unresolved'], true)) {
            throw new DomainException('Invalid catalog entity type or status');
        }
        if ($id !== null && ! Str::isUuid($id)) {
            throw new DomainException('Invalid catalog entity UUID');
        }

        return DB::transaction(function () use ($kind, $aliases, $id, $status): string {
            $matches = DB::table('catalog_entity_aliases')->where('kind', $kind)->whereIn('alias', $aliases)->pluck('entity_id')->unique()->all();
            if ($id !== null) {
                $matches[] = strtolower($id);
            }
            $matches = array_values(array_unique($matches));
            if (count($matches) > 1) {
                throw new DomainException('Conflicting established catalog identities');
            }
            $entityId = $matches[0] ?? (string) Str::uuid();
            $existing = DB::table('catalog_entities')->where('id', $entityId)->first();
            if ($existing && $existing->kind !== $kind) {
                throw new DomainException('Catalog UUID already belongs to another entity type');
            }
            if (! $existing) {
                DB::table('catalog_entities')->insert(['id' => $entityId, 'kind' => $kind, 'resolution_status' => $status, 'created_at' => now(), 'updated_at' => now()]);
            } elseif ($status === 'verified' && $existing->resolution_status === 'unresolved') {
                DB::table('catalog_entities')->where('id', $entityId)->update(['resolution_status' => 'verified', 'updated_at' => now()]);
            }
            foreach ($aliases as $alias) {
                $this->alias($kind, $alias, $entityId);
            }

            return $entityId;
        });
    }

    public function resolve(string $kind, string $reference): ?string
    {
        if (Str::isUuid($reference)) {
            return DB::table('catalog_entities')->where('id', strtolower($reference))->where('kind', $kind)->value('id');
        }

        return DB::table('catalog_entity_aliases')->where('kind', $kind)->where('alias', $reference)->value('entity_id');
    }

    public function alias(string $kind, string $alias, string $id): void
    {
        if ($alias === '' || strlen($alias) > 200 || ! $this->resolve($kind, $id)) {
            throw new DomainException('Invalid entity alias');
        }
        DB::table('catalog_entity_aliases')->insertOrIgnore(['kind' => $kind, 'alias' => $alias, 'entity_id' => $id]);
        if ($this->resolveLegacy($kind, $alias) !== $id) {
            throw new DomainException('Alias already belongs to another entity');
        }
    }

    public function resolveLegacy(string $kind, string $alias): ?string
    {
        return DB::table('catalog_entity_aliases')->where('kind', $kind)->where('alias', $alias)->value('entity_id');
    }
}
