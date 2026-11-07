<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogActionArchive
{
    public function save(string $table, object $row, string $entity): void
    {
        $snapshot = json_encode($row, JSON_THROW_ON_ERROR);
        DB::table('catalog_action_reconciliations')->insertOrIgnore([
            'source_table' => $table, 'source_id' => $row->id, 'entity_id' => $entity,
            'snapshot_sha256' => hash('sha256', $snapshot), 'snapshot_json' => $snapshot, 'created_at' => now(),
        ]);
    }
}
