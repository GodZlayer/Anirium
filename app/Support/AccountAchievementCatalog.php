<?php

namespace App\Support;

use App\Models\User;

class AccountAchievementCatalog
{
    private function records(): array
    {
        return json_decode(file_get_contents(resource_path('data/achievement-catalog.json')), true, flags: JSON_THROW_ON_ERROR);
    }

    public function resolve(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $records = $this->records();
        if (isset($records[$value])) {
            return $value;
        }
        $matches = array_keys(array_filter($records, fn ($record) => in_array($value, $record['labels'], true)));

        return count($matches) === 1 ? $matches[0] : null;
    }

    public function allowed(User $user): array
    {
        $completion = app(CatalogUserCompletion::class)->read($user->id);
        $experience = app(AccountExperience::class)->read($user, $completion);
        $stats = ['tier' => (int) $user->tier, 'level' => $experience['level'],
            'episodes' => $completion['counts']['episodes'], 'universes' => $completion['counts']['universes']];

        return array_keys(array_filter($this->records(), function ($record) use ($stats) {
            $condition = $record['condition'];
            $value = $stats[$condition['field']] ?? null;

            return $value !== null && ($condition['operator'] === 'eq' ? $value === $condition['value'] : $condition['operator'] === 'gte' && $value >= $condition['value']);
        }));
    }
}
