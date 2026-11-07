<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogEpisodeReferenceRepair
{
    public function __construct(private CatalogExternalIdentityStore $external, private CatalogDatabaseRetry $retry) {}

    public function run(): array
    {
        $count = 0;
        while (true) {
            $rows = DB::table('catalog_external_identities as x')->leftJoin('catalog_episodes as e', 'e.id', '=', 'x.entity_id')
                ->where('x.provider', 'tvdb')->where('x.namespace', 'anime:episode')->orderBy('x.external_id')
                ->limit(250)->get(['x.external_id', 'x.entity_id', 'e.work_id']);
            if ($rows->isEmpty()) {
                return ['scoped_episode_references' => $count];
            }
            $this->retry->run(fn () => DB::transaction(function () use ($rows): void {
                foreach ($rows as $row) {
                    if (! $row->work_id) {
                        throw new DomainException('Legacy episode reference has no SQL episode parent');
                    }
                    $this->external->attach($row->entity_id, 'tvdb', 'anime:episode:work:'.$row->work_id, $row->external_id);
                    DB::table('catalog_external_identities')->where(['provider' => 'tvdb', 'namespace' => 'anime:episode',
                        'external_id' => $row->external_id, 'entity_id' => $row->entity_id])->delete();
                }
            }));
            $count += $rows->count();
        }
    }
}
