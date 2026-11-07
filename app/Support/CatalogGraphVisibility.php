<?php

namespace App\Support;

class CatalogGraphVisibility
{
    public function __construct(private CatalogSearch $catalog) {}

    public function works(array $ids, bool $adult): array
    {
        if ($ids === []) {
            return [];
        }
        $references = array_map(fn (string $id) => 'work:'.$id, array_values(array_unique($ids)));
        $resolved = $this->catalog->summaries($references, $adult)['resolved'];

        return array_values(array_unique(array_column($resolved, 'work_id')));
    }
}
