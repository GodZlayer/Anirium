<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // 1. Tabela Unificada de Preferências/Estado do Usuário ligadas a qualquer ID da hierarquia
        Schema::create('user_entity_preferences', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('target_type', 32)->index(); // 'universe', 'work', 'season', 'episode'
            $table->string('target_id', 64)->index();   // ID único da entidade
            $table->string('status', 32)->nullable();   // 'watching', 'completed', 'plan_to_watch', 'dropped'
            $table->decimal('user_score', 3, 1)->nullable(); // Nota pessoal do usuário (0.0 a 10.0)
            $table->boolean('bookmarked')->default(false)->index();
            $table->unsignedInteger('progress_seconds')->default(0);
            $table->timestamp('last_interacted_at')->useCurrent()->index();
            $table->timestamps();

            $table->unique(['user_id', 'target_type', 'target_id'], 'user_target_unique');
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });

        // 2. Tabela Unificada de Discussões e Comentários Comunitários
        Schema::create('entity_discussions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('target_type', 32)->index(); // 'universe', 'work', 'season', 'episode'
            $table->string('target_id', 64)->index();   // ID da entidade comentada
            $table->text('comment_body');
            $table->boolean('contains_spoilers')->default(false);
            $table->unsignedInteger('likes_count')->default(0);
            $table->unsignedBigInteger('parent_comment_id')->nullable()->index(); // Resposta a outro comentário
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('parent_comment_id')->references('id')->on('entity_discussions')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('entity_discussions');
        Schema::dropIfExists('user_entity_preferences');
    }
};
