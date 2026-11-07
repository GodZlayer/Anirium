<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Proveniência narrativa de cada episódio: de onde ele vem no material oficial.
 * basis: adapted (adapta capítulos), anime_original (canônico só do anime), filler, recap, unknown.
 * A faixa de capítulos só é preenchida quando uma fonte verificada a declara; nunca é estimada.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_episode_source_refs', function (Blueprint $table) {
            $table->uuid('episode_id');
            $table->uuid('work_id');
            $table->string('provider', 64);
            $table->string('basis', 32)->default('unknown');
            $table->foreignUuid('source_work_id')->nullable()->constrained('catalog_works', 'id')->restrictOnDelete();
            $table->string('unit', 16)->nullable();
            $table->decimal('start_number', 8, 1)->nullable();
            $table->decimal('end_number', 8, 1)->nullable();
            $table->text('source_url')->nullable();
            $table->dateTime('checked_at');
            $table->primary(['episode_id', 'provider']);
            $table->foreign(['episode_id', 'work_id'])->references(['id', 'work_id'])->on('catalog_episodes')->restrictOnDelete();
            $table->index(['source_work_id', 'start_number']);
            $table->index(['work_id', 'basis']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_episode_source_refs');
    }
};
