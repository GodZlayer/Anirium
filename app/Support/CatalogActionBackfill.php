<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogActionBackfill
{
    public function __construct(private CatalogActionTarget $targets, private CatalogPreferenceReconciliation $preferences, private CatalogActionArchive $archive) {}

    public function run(): array
    {
        $report = [];
        foreach (['user_entity_preferences', 'entity_discussions', 'user_interaction_events'] as $table) {
            $counts = ['linked' => 0, 'unresolved' => 0, 'non_catalog' => 0];
            DB::table($table)->where(function ($query) {
                $query->whereNull('entity_id')->orWhereColumn('target_id', '<>', 'entity_id');
            })->orderBy('id')->chunkById(250, function ($rows) use ($table, &$counts): void {
                foreach ($rows as $row) {
                    $row = DB::table($table)->where('id', $row->id)->first();
                    if (! $row || ($row->entity_id !== null && $row->target_id === $row->entity_id)) {
                        continue;
                    }
                    if (! in_array($row->target_type, CatalogIdentityStore::KINDS, true)) {
                        $counts['non_catalog']++;

                        continue;
                    }
                    $id = $this->targets->canonical($row->target_type, $row->entity_id ?? $row->target_id);
                    if ($id === null) {
                        $counts['unresolved']++;

                        continue;
                    }
                    DB::transaction(function () use ($table, $row, $id, &$counts): void {
                        if ($table === 'user_entity_preferences') {
                            $this->preferences->run($row->user_id, $row->target_type, $id);
                        } else {
                            $this->archive->save($table, $row, $id);
                            DB::table($table)->where('id', $row->id)->update(['entity_id' => $id, 'target_id' => $id]);
                        }
                        $counts['linked']++;
                    });
                }
            });
            $report[$table] = $counts;
        }

        return $report;
    }
}
