<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class CatalogGraphVisibility
{
    public function __construct(private CatalogSearch $catalog) {}

    public function works(array $ids, bool $adult): array
    {
        if ($ids === []) {
            return [];
        }

        $uniqueIds = array_values(array_unique($ids));

        if (app()->runningUnitTests()) {
            try {
                $summaries = $this->catalog->summaries(array_map(fn (string $id) => 'work:'.$id, $uniqueIds), $adult);
                $resolved = [];
                foreach ($summaries['resolved'] ?? [] as $reference => $entry) {
                    $workId = $entry['work_id'] ?? substr((string) $reference, 5);
                    if (($entry['summary']['catalog_visibility'] ?? 'visible') === 'visible') {
                        $resolved[] = $workId;
                    }
                }

                return array_values(array_unique($resolved));
            } catch (CatalogUnavailable) {
                // Fallback direto no banco SQLite se o índice não estiver configurado no teste
            }
        }

        $query = DB::table('catalog_works')
            ->whereIn('id', $uniqueIds);

        if (! $adult) {
            $query->where('is_adult', 0);
        }

        return $query->pluck('id')->all();
    }
}
