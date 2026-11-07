<?php

namespace App\Support;

use DomainException;
use Illuminate\Support\Facades\DB;

class CatalogPreferenceReconciliation
{
    public function __construct(private CatalogActionTarget $targets, private CatalogActionArchive $archive) {}

    public function run(int $user, string $kind, string $entity): ?object
    {
        return DB::transaction(function () use ($user, $kind, $entity): ?object {
            $aliases = app(EntityContextAliases::class)->for($kind, $entity, false);
            $rows = DB::table('user_entity_preferences')->where('user_id', $user)->where('target_type', $kind)
                ->where(function ($query) use ($entity, $aliases) {
                    $query->where('entity_id', $entity)->orWhereIn('target_id', $aliases);
                })
                ->orderBy('last_interacted_at')->orderBy('id')->get()->filter(function (object $row) use ($kind, $entity): bool {
                    $resolved = $this->targets->canonical($kind, $row->target_id);
                    if ($row->entity_id === $entity && $resolved !== null && $resolved !== $entity) {
                        throw new DomainException('Preference contains contradictory catalog identities');
                    }

                    return $row->entity_id === $entity || ($row->entity_id === null && $resolved === $entity);
                });
            if ($rows->isEmpty()) {
                return null;
            }
            $retained = $rows->firstWhere('target_id', $entity) ?? $rows->first();
            if ($rows->count() === 1 && $retained->target_id === $entity && $retained->entity_id === $entity) {
                return $retained;
            }
            $merged = ['entity_id' => $entity, 'target_id' => $entity, 'bookmarked' => false, 'liked' => false, 'progress_seconds' => 0];
            $metadata = [];
            foreach ($rows as $row) {
                $this->archive->save('user_entity_preferences', $row, $entity);
                foreach (['status', 'user_score'] as $field) {
                    if ($row->$field !== null) {
                        $merged[$field] = $row->$field;
                    }
                }
                foreach (['bookmarked', 'liked'] as $field) {
                    $merged[$field] = $merged[$field] || (bool) $row->$field;
                }
                $merged['progress_seconds'] = max($merged['progress_seconds'], $row->progress_seconds);
                $oldMetadata = json_decode($row->metadata ?? '{}', true);
                $metadata = array_replace($metadata, is_array($oldMetadata) ? $oldMetadata : []);
                $merged['last_interacted_at'] = $row->last_interacted_at;
                $merged['updated_at'] = $row->updated_at;
            }
            $merged['metadata'] = json_encode($metadata, JSON_THROW_ON_ERROR);
            DB::table('user_entity_preferences')->whereIn('id', $rows->pluck('id')->reject(fn ($id) => $id === $retained->id))->delete();
            DB::table('user_entity_preferences')->where('id', $retained->id)->update($merged);

            return DB::table('user_entity_preferences')->where('id', $retained->id)->first();
        });
    }
}
