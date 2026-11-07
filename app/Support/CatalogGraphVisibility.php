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

        // Verificação direta no banco SQLite do catálogo via índice dedicado
        $query = DB::table('catalog_works')
            ->whereIn('id', $uniqueIds);

        if (! $adult) {
            $query->where('is_adult', 0);
        }

        return $query->pluck('id')->all();
    }
}
