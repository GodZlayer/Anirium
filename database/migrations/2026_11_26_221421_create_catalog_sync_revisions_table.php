<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('catalog_sync_revisions')) {
            Schema::create('catalog_sync_revisions', function (Blueprint $table): void {
                $table->id();
                $table->string('source', 64);
                $table->string('entity_type', 32)->default('work');
                $table->string('entity_id', 64);
                $table->string('action', 16)->default('upsert');
                $table->timestamp('created_at')->useCurrent();

                $table->index(['entity_type', 'id'], 'catalog_sync_rev_type_id_idx');
                $table->index(['entity_type', 'entity_id'], 'catalog_sync_rev_entity_idx');
            });
        }

        if (Schema::hasTable('catalog_universes') && ! Schema::hasColumn('catalog_universes', 'is_curated')) {
            Schema::table('catalog_universes', function (Blueprint $table): void {
                $table->boolean('is_curated')->default(false);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_sync_revisions');

        if (Schema::hasTable('catalog_universes') && Schema::hasColumn('catalog_universes', 'is_curated')) {
            Schema::table('catalog_universes', function (Blueprint $table): void {
                $table->dropColumn('is_curated');
            });
        }
    }
};
