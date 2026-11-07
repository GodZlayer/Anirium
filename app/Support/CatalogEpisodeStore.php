<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogEpisodeStore
{
    public function __construct(private CatalogIdentityStore $identities, private CatalogExternalIdentityStore $external) {}

    public function put(string $workId, int $number, array $aliases = [], ?array $providerIdentity = null, ?string $seasonId = null, string $scheme = 'original'): string
    {
        if ($number < 1 || ! preg_match('/^[a-z][a-z0-9_-]{0,31}$/D', $scheme)) {
            throw new DomainException('Invalid episode numbering');
        }

        return DB::transaction(function () use ($workId, $number, $aliases, $providerIdentity, $seasonId, $scheme): string {
            $mapped = $providerIdentity ? $this->external->find(...$providerIdentity) : null;
            $position = DB::table('catalog_episodes')->where(['work_id' => $workId, 'numbering_scheme' => $scheme, 'number' => $number])->first();
            if ($mapped && $position && $mapped !== $position->id) {
                throw new DomainException('Episode identity conflicts with existing numbering');
            }
            $id = $this->identities->create('episode', $aliases, $mapped ?? $position?->id);
            $existing = DB::table('catalog_episodes')->where('id', $id)->first();
            if ($existing && $existing->work_id !== $workId) {
                throw new DomainException('Episode cannot move to another work implicitly');
            }
            DB::table('catalog_episodes')->updateOrInsert(['id' => $id], ['work_id' => $workId, 'number' => $number, 'season_id' => $seasonId ?? $existing?->season_id, 'numbering_scheme' => $scheme]);
            if ($providerIdentity) {
                $this->external->attach($id, ...$providerIdentity);
            }

            return $id;
        });
    }
}
