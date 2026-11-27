<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CatalogRevisionRecorder
{
    /**
     * Registra um lote de entidades alteradas/removidas na fonte única de verdade
     * e invalida os caches derivados (grade, hero e snapshot).
     *
     * @param  array<int, string>  $entityIds
     */
    public function recordBatch(string $source, array $entityIds, string $action = 'upsert', string $entityType = 'work'): int
    {
        $uniqueIds = array_values(array_unique(array_filter(array_map(
            static fn (mixed $id): string => trim((string) $id),
            $entityIds
        ))));

        if ($uniqueIds === [] || ! Schema::hasTable('catalog_sync_revisions')) {
            $this->invalidateCaches();

            return $this->currentRevision();
        }

        $now = now()->toDateTimeString();
        $rows = [];
        foreach ($uniqueIds as $id) {
            $rows[] = [
                'source' => substr($source, 0, 64),
                'entity_type' => substr($entityType, 0, 32),
                'entity_id' => substr($id, 0, 64),
                'action' => $action === 'delete' ? 'delete' : 'upsert',
                'created_at' => $now,
            ];
        }

        foreach (array_chunk($rows, 250) as $chunk) {
            DB::table('catalog_sync_revisions')->insert($chunk);
        }

        $this->invalidateCaches();

        return $this->currentRevision();
    }

    public function currentRevision(): int
    {
        if (! Schema::hasTable('catalog_sync_revisions')) {
            return 1;
        }

        $max = (int) (DB::table('catalog_sync_revisions')->max('id') ?? 0);

        return max(1, $max);
    }

    public function invalidateCaches(): void
    {
        $keys = [
            'catalog:home:hero:3latest:canonical:v2',
            'catalog:calendar:by_day:canonical_full',
            'catalog:home:hero:3latest:canonical:v3:safe',
            'catalog:home:hero:3latest:canonical:v3:adult',
            'catalog:calendar:by_day:canonical_full:v2:safe',
            'catalog:calendar:by_day:canonical_full:v2:adult',
            'catalog:calendar:by_day:ssot:v3:safe',
            'catalog:calendar:by_day:ssot:v3:adult',
            'catalog:snapshot:works:v1:safe',
            'catalog:snapshot:works:v1:adult',
        ];

        foreach ($keys as $key) {
            Cache::forget($key);
        }

        foreach (['en-US', 'pt-BR', 'es-ES', 'ja-JP', 'zh-CN', 'ru-RU', 'it-IT', 'fr-FR', 'de-DE', 'hi-IN'] as $locale) {
            Cache::forget("catalog:home:hero:3latest:canonical:v4:safe:{$locale}");
            Cache::forget("catalog:home:hero:3latest:canonical:v4:adult:{$locale}");
        }
    }
}
