<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CatalogActionTarget
{
    public function __construct(private CatalogIdentityStore $identities) {}

    public function canonical(string $kind, string $reference): ?string
    {
        $id = $this->legacy($kind, $reference);

        return $id && DB::table('catalog_entities')->where('id', $id)->where('kind', $kind)->where('resolution_status', 'verified')->exists() ? $id : null;
    }

    public function legacy(string $kind, string $reference): ?string
    {
        if (! in_array($kind, CatalogIdentityStore::KINDS, true)) {
            return null;
        }
        $direct = $this->identities->resolve($kind, $reference);
        if ($direct) {
            return $direct;
        }
        if (Str::isUuid($reference)) {
            return null;
        }
        $value = str_starts_with($reference, $kind.':') ? substr($reference, strlen($kind) + 1) : $reference;
        $direct = $this->identities->resolve($kind, $value);
        if ($direct) {
            return $direct;
        }
        if ($kind === 'work') {
            return str_starts_with($value, 'work:') ? $this->identities->resolve('work', substr($value, 5)) : null;
        }
        if ($kind === 'episode' && preg_match('/^(.+):ep-([1-9]\d*)$/D', $value, $parts)) {
            $work = $this->legacy('work', $parts[1]);

            return $work ? $this->identities->resolveLegacy('episode', 'work:'.$work.':ep-'.$parts[2]) : null;
        }
        if ($kind === 'universe') {
            return $this->identities->resolveLegacy('universe', 'published:'.$value);
        }

        return null;
    }
}
