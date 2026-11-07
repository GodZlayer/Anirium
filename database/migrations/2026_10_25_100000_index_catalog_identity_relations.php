<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private array $indexes = [
        ['catalog_universe_works', ['work_id', 'universe_id'], 'catalog_work_universe_lookup'],
        ['catalog_entity_aliases', ['entity_id', 'kind'], 'catalog_entity_alias_lookup'],
        ['catalog_external_identities', ['entity_id'], 'catalog_entity_provider_lookup'],
        ['catalog_arc_works', ['work_id', 'arc_id'], 'catalog_work_arc_lookup'],
        ['catalog_arc_episodes', ['episode_id', 'arc_id'], 'catalog_episode_arc_lookup'],
        ['catalog_work_relations', ['to_work_id', 'from_work_id'], 'catalog_incoming_relation_lookup'],
    ];

    public function up(): void
    {
        foreach ($this->indexes as [$table, $columns, $name]) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->index($columns, $name));
        }
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::statement('CREATE INDEX catalog_episode_release_lookup ON catalog_episodes(julianday(air_date_utc),id)');
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::statement('DROP INDEX catalog_episode_release_lookup');
        }
        foreach ($this->indexes as [$table, $columns, $name]) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($name));
        }
    }
};
