<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::statement("CREATE INDEX catalog_ext_id_anime_work_lookup ON catalog_external_identities (provider, external_id, entity_id) WHERE namespace = 'anime:work'");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::statement('DROP INDEX catalog_ext_id_anime_work_lookup');
        }
    }
};
