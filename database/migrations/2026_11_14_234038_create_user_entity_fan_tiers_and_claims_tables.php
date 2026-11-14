<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Tabela de Reivindicações Imutáveis de XP por Marco (garante XP creditado estritamente 1 vez)
        Schema::create('user_achievement_claims', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('entity_kind', 32)->index(); // 'work', 'universe', 'arc'
            $table->string('entity_id', 64)->index();
            $table->string('milestone_tier', 32)->index(); // 'tier_1', 'tier_2', 'tier_3', 'tier_4'
            $table->unsignedInteger('xp_granted');
            $table->timestamp('claimed_at')->useCurrent();

            $table->unique(['user_id', 'entity_kind', 'entity_id', 'milestone_tier'], 'uq_user_milestone_claim');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });

        // 2. Tabela de Estado Dinâmico de Título / Fã Tier (recalculável e revogável conforme o catálogo expande)
        Schema::create('user_entity_fan_states', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('entity_kind', 32)->index();
            $table->string('entity_id', 64)->index();
            $table->unsignedTinyInteger('current_tier')->default(0); // 0=Nenhum, 1=Bronze, 2=Prata, 3=Ouro, 4=Diamante
            $table->decimal('completion_percentage', 5, 2)->default(0.00); // 0.00% a 100.00%
            $table->boolean('has_liked')->default(false);
            $table->boolean('has_bookmarked')->default(false);
            $table->boolean('has_rated')->default(false);
            $table->boolean('has_commented')->default(false);
            $table->unsignedInteger('episodes_watched_qualifying')->default(0);
            $table->unsignedInteger('total_released_episodes')->default(0);
            $table->string('dynamic_title', 128)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'entity_kind', 'entity_id'], 'uq_user_entity_fan_state');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_entity_fan_states');
        Schema::dropIfExists('user_achievement_claims');
    }
};
