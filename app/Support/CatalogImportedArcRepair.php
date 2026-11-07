<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogImportedArcRepair
{
    public function __construct(private CatalogIdentityStore $identities) {}

    public function record(array $record): void
    {
        if (empty($record['arcs'])) {
            return;
        }
        $work = $record['work_id'];
        $universe = $this->identities->resolveLegacy('universe', 'published:'.$record['universe_reference']);
        if (! $universe || ! DB::table('catalog_universe_works')->where(['universe_id' => $universe, 'work_id' => $work])->exists()) {
            throw new DomainException('Arc repair requires the existing SQL universe membership');
        }
        $episodes = DB::table('catalog_episodes')->where('work_id', $work)->pluck('id', 'number');
        foreach ($record['arcs'] as $arc) {
            $id = $this->identities->resolveLegacy('arc', 'work:'.$work.':source-arc:'.$arc['arcId']);
            if (! $id || ! DB::table('catalog_arcs')->where(['id' => $id, 'universe_id' => $universe])->exists()) {
                throw new DomainException('Arc repair cannot allocate or move an existing identity');
            }
            if (! is_int($arc['startEp']) || ! is_int($arc['endEp']) || $arc['startEp'] < 1 || $arc['endEp'] < $arc['startEp']) {
                throw new DomainException('Invalid sourced arc range');
            }
            DB::table('catalog_arc_works')->updateOrInsert(['arc_id' => $id, 'work_id' => $work],
                ['universe_id' => $universe, 'start_number' => $arc['startEp'], 'end_number' => $arc['endEp']]);
            foreach ($episodes as $number => $episode) {
                if ($number >= $arc['startEp'] && $number <= $arc['endEp']) {
                    DB::table('catalog_arc_episodes')->insertOrIgnore(['arc_id' => $id, 'episode_id' => $episode, 'universe_id' => $universe, 'work_id' => $work]);
                }
            }
        }
    }
}
