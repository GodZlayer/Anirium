<?php

namespace App\Support;

use Illuminate\Support\Str;

class CatalogLibrary
{
    public function __construct(private CatalogSearch $catalog) {}

    public static function reference(string $value): ?string
    {
        return self::canonical($value) ?? (str_starts_with($value, 'work:') ? self::canonical(substr($value, 5)) : null);
    }

    private static function canonical(string $value): ?string
    {
        if (Str::isUuid($value)) {
            return 'work:'.strtolower($value);
        }
        if (preg_match('/^[1-9]\d*$/D', $value)) {
            return 'anime:'.$value;
        }
        if (preg_match('/^(anime|manga|novel):[1-9]\d*$/D', $value)) {
            return $value;
        }
        if (preg_match('/^work:[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iD', $value)) {
            return strtolower($value);
        }

        return null;
    }

    public function read(array $preferences, string $view, int $page, bool $adult): array
    {
        $preferences = array_values(array_filter($preferences, fn ($item) => $item->target_type === 'work'));
        usort($preferences, fn ($a, $b) => [strtotime($b->last_interacted_at ?? $b->updated_at ?? '') ?: 0, $b->id ?? 0]
            <=> [strtotime($a->last_interacted_at ?? $a->updated_at ?? '') ?: 0, $a->id ?? 0]);
        $references = array_map(fn ($item) => self::reference($item->entity_id ?? $item->target_id), $preferences);
        $lookup = $this->catalog->summaries(array_values(array_filter($references)), $adult);
        $items = $seen = $unresolved = [];
        foreach ($preferences as $index => $preference) {
            $reference = $references[$index];
            if (! $reference) {
                continue;
            }
            $work = $lookup['resolved'][$reference] ?? null;
            if (! $work) {
                $unresolved[$reference] = true;

                continue;
            }
            if (isset($seen[$work['work_id']])) {
                continue;
            }
            $seen[$work['work_id']] = true;
            $selected = match ($view) {
                'bookmarks' => (bool) $preference->bookmarked,
                'history' => $preference->status === 'completed',
                'ratings' => $preference->user_score !== null,
            };
            if ($selected) {
                $items[] = [...$work['summary'], 'work_id' => $work['work_id'], 'library' => [
                    'bookmarked' => (bool) $preference->bookmarked, 'status' => $preference->status,
                    'user_score' => $preference->user_score, 'reference' => $reference,
                ]];
            }
        }
        $total = count($items);

        return ['generation' => $lookup['generation'], 'items' => array_slice($items, ($page - 1) * 24, 24),
            'page' => $page, 'pages' => (int) ceil($total / 24), 'total' => $total, 'unresolved' => count($unresolved)];
    }
}
