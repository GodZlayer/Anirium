<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogExternalIdentityStore
{
    public function find(string $provider, string $namespace, string $externalId): ?string
    {
        return DB::table('catalog_external_identities')->where(['provider' => $provider, 'namespace' => $namespace, 'external_id' => $externalId])->value('entity_id');
    }

    public function attach(string $entityId, string $provider, string $namespace, string $externalId): void
    {
        foreach ([[$provider, 40], [$namespace, 80], [$externalId, 512]] as [$value, $limit]) {
            if ((string) $value === '' || strlen((string) $value) > $limit) {
                throw new DomainException('Invalid provider identity');
            }
        }
        DB::table('catalog_external_identities')->insertOrIgnore(['provider' => $provider, 'namespace' => $namespace, 'external_id' => $externalId, 'entity_id' => $entityId]);
        if ($this->find($provider, $namespace, $externalId) !== $entityId) {
            throw new DomainException('Provider identity already belongs to another entity');
        }
    }
}
