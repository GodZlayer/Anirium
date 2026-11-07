<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogGraphImporter
{
    public function __construct(private CatalogIdentityStore $identities, private CatalogExternalIdentityStore $external, private CatalogGraphChildren $children) {}

    public function work(array $record): string
    {
        if (! in_array($record['media'] ?? '', ['anime', 'manga', 'novel'], true)
            || ! is_string($record['title'] ?? null) || trim($record['title']) === '') {
            throw new DomainException('Invalid work record');
        }

        return DB::transaction(function () use ($record): string {
            $id = $this->identities->create('work', $record['aliases'], $record['work_id']);
            $media = DB::table('catalog_works')->where('id', $id)->value('media');
            if ($media !== null && $media !== $record['media']) {
                throw new DomainException('Work media cannot change without explicit reconciliation');
            }
            DB::table('catalog_works')->updateOrInsert(['id' => $id], ['media' => $record['media'], 'title' => $record['title'], 'format' => $record['format'] ?? null, 'status' => $record['status'] ?? null, 'episode_count' => $record['episode_count'] ?? null]);
            foreach ($record['references'] ?? [] as $reference) {
                $this->external->attach($id, $reference['provider'], $reference['media'].':work', (string) $reference['id']);
            }
            foreach ($record['titles'] ?? [] as $locale => $title) {
                DB::table('catalog_entity_titles')->updateOrInsert(['entity_id' => $id, 'locale' => $locale], ['title' => $title]);
            }
            $universe = $this->universe($record['universe_reference'], $id);
            $this->children->import($id, $universe, $record);

            return $id;
        });
    }

    private function universe(string $reference, string $workId): string
    {
        $alias = 'published:'.$reference;
        $id = $this->identities->resolveLegacy('universe', $alias);
        if (! $id) {
            $existing = DB::table('catalog_universe_works')->where('work_id', $workId)->pluck('universe_id')->unique();
            if ($existing->count() > 1) {
                throw new DomainException('Ambiguous existing universe membership');
            }
            $id = $this->identities->create('universe', [$alias], $existing->first());
        }
        DB::table('catalog_universes')->insertOrIgnore(['id' => $id]);
        DB::table('catalog_universe_works')->insertOrIgnore(['universe_id' => $id, 'work_id' => $workId]);

        return $id;
    }

    public function relations(array $record): int
    {
        $pending = 0;
        foreach ($record['relations'] ?? [] as $relation) {
            if (! DB::table('catalog_works')->where('id', $relation['target_work_id'])->exists()) {
                $pending++;

                continue;
            }
            DB::table('catalog_work_relations')->insertOrIgnore(['from_work_id' => $record['work_id'], 'to_work_id' => $relation['target_work_id'], 'relation_type' => $relation['relation_type'], 'provider' => $relation['source']]);
        }

        return $pending;
    }
}
