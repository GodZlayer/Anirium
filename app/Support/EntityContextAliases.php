<?php

namespace App\Support;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class EntityContextAliases
{
    public function matching(string $type, string $id, bool $adult, string $prefix = ''): \Closure
    {
        $aliases = $this->for($type, $id, $adult);
        $entity = app(CatalogActionTarget::class)->canonical($type, $id);

        return function (Builder $query) use ($aliases, $entity, $prefix): void {
            $query->whereIn($prefix.'target_id', $aliases);
            if ($entity !== null) {
                $query->orWhere($prefix.'entity_id', $entity);
            }
        };
    }

    public function for(string $type, string $id, bool $adult): array
    {
        $entity = app(CatalogActionTarget::class)->canonical($type, $id);
        if ($entity !== null) {
            $aliases = DB::table('catalog_entity_aliases')->where('kind', $type)->where('entity_id', $entity)->pluck('alias')->all();
            if ($type === 'universe') {
                foreach ($aliases as $alias) {
                    if (str_starts_with($alias, 'published:')) {
                        $aliases[] = 'universe:'.substr($alias, 10);
                    }
                }
            }
            if ($type === 'episode') {
                foreach ($aliases as $alias) {
                    if (preg_match('/^(?:episode:)?work:(.+:ep-[1-9]\d*)$/D', $alias, $match)
                        && app(CatalogActionTarget::class)->canonical('episode', 'episode:'.$match[1]) === $entity) {
                        $aliases[] = $match[1];
                        $aliases[] = 'episode:'.$match[1];
                    }
                }
            }

            return array_values(array_unique([$id, $entity, ...$aliases, ...array_map(fn (string $alias) => $type.':'.$alias, $aliases)]));
        }

        return [$id];
    }
}
