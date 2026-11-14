<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_entities', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('kind', 24)->index();
            $table->string('resolution_status', 24)->default('verified');
            $table->timestamps();
        });
        Schema::create('catalog_entity_aliases', function (Blueprint $table) {
            $table->string('kind', 24);
            $table->string('alias', 200);
            $table->foreignUuid('entity_id')->constrained('catalog_entities')->restrictOnDelete();
            $table->primary(['kind', 'alias']);
        });
        Schema::create('catalog_entity_titles', function (Blueprint $table) {
            $table->foreignUuid('entity_id')->constrained('catalog_entities')->restrictOnDelete();
            $table->string('locale', 16);
            $table->text('title');
            $table->primary(['entity_id', 'locale']);
        });
        Schema::create('catalog_external_identities', function (Blueprint $table) {
            $table->string('provider', 40);
            $table->string('namespace', 80);
            $table->string('external_id', 160);
            $table->foreignUuid('entity_id')->constrained('catalog_entities')->restrictOnDelete();
            $table->primary(['provider', 'namespace', 'external_id'], 'catalog_external_identity_key');
        });
        Schema::create('catalog_universes', function (Blueprint $table) {
            $table->foreignUuid('id')->primary()->constrained('catalog_entities')->restrictOnDelete();
        });
        Schema::create('catalog_works', function (Blueprint $table) {
            $table->foreignUuid('id')->primary()->constrained('catalog_entities')->restrictOnDelete();
            $table->string('media', 16)->index();
            $table->string('title');
            $table->string('format', 32)->nullable();
            $table->string('status', 32)->nullable()->index();
            $table->unsignedInteger('episode_count')->nullable();
            $table->boolean('is_adult')->default(false)->index();
        });
        Schema::create('catalog_universe_works', function (Blueprint $table) {
            $table->foreignUuid('universe_id')->constrained('catalog_universes')->restrictOnDelete();
            $table->foreignUuid('work_id')->constrained('catalog_works')->restrictOnDelete();
            $table->primary(['universe_id', 'work_id']);
        });
        Schema::create('catalog_seasons', function (Blueprint $table) {
            $table->foreignUuid('id')->primary()->constrained('catalog_entities')->restrictOnDelete();
            $table->foreignUuid('work_id')->constrained('catalog_works')->restrictOnDelete();
            $table->unsignedInteger('number');
            $table->unique(['work_id', 'number']);
            $table->unique(['id', 'work_id']);
        });
        Schema::create('catalog_episodes', function (Blueprint $table) {
            $table->foreignUuid('id')->primary()->constrained('catalog_entities')->restrictOnDelete();
            $table->foreignUuid('work_id')->constrained('catalog_works')->restrictOnDelete();
            $table->uuid('season_id')->nullable();
            $table->string('numbering_scheme', 32)->default('original');
            $table->unsignedInteger('number');
            $table->timestampTz('air_date_utc')->nullable();
            $table->string('classification', 32)->default('unknown');
            $table->unique(['work_id', 'numbering_scheme', 'number']);
            $table->unique(['id', 'work_id']);
            $table->foreign(['season_id', 'work_id'])->references(['id', 'work_id'])->on('catalog_seasons')->restrictOnDelete();
        });
        Schema::create('catalog_arcs', function (Blueprint $table) {
            $table->foreignUuid('id')->primary()->constrained('catalog_entities')->restrictOnDelete();
            $table->foreignUuid('universe_id')->constrained('catalog_universes')->restrictOnDelete();
            $table->string('title');
            $table->string('classification', 32)->default('unknown');
            $table->text('source_url')->nullable();
            $table->unique(['id', 'universe_id']);
        });
        Schema::create('catalog_arc_episodes', function (Blueprint $table) {
            $table->uuid('arc_id');
            $table->uuid('episode_id');
            $table->uuid('universe_id');
            $table->uuid('work_id');
            $table->foreign(['arc_id', 'universe_id'])->references(['id', 'universe_id'])->on('catalog_arcs')->restrictOnDelete();
            $table->foreign(['episode_id', 'work_id'])->references(['id', 'work_id'])->on('catalog_episodes')->restrictOnDelete();
            $table->foreign(['universe_id', 'work_id'])->references(['universe_id', 'work_id'])->on('catalog_universe_works')->restrictOnDelete();
            $table->primary(['arc_id', 'episode_id']);
        });
        Schema::create('catalog_work_relations', function (Blueprint $table) {
            $table->foreignUuid('from_work_id')->constrained('catalog_works')->restrictOnDelete();
            $table->foreignUuid('to_work_id')->constrained('catalog_works')->restrictOnDelete();
            $table->string('relation_type', 64);
            $table->string('provider', 40);
            $table->primary(['from_work_id', 'to_work_id', 'relation_type', 'provider'], 'catalog_work_relation_key');
        });
        foreach (['user_entity_preferences', 'entity_discussions', 'user_interaction_events'] as $name) {
            Schema::table($name, function (Blueprint $table) {
                $table->foreignUuid('entity_id')->nullable()->constrained('catalog_entities')->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (['user_entity_preferences', 'entity_discussions', 'user_interaction_events'] as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropConstrainedForeignId('entity_id'));
        }
        foreach (['catalog_work_relations', 'catalog_arc_episodes', 'catalog_arcs', 'catalog_episodes', 'catalog_seasons', 'catalog_universe_works', 'catalog_works', 'catalog_universes', 'catalog_external_identities', 'catalog_entity_titles', 'catalog_entity_aliases', 'catalog_entities'] as $name) {
            Schema::dropIfExists($name);
        }
    }
};
