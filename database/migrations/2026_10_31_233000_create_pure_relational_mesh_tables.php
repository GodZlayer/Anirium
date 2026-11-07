<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Criação de tabelas relacionais puras para completar 100% da malha ontológica:
     * - Criadores (pessoas físicas)
     * - Papéis (diretor, autor, ilustrador, roteirista, seiyuu, compositor)
     * - Estúdios de produção
     * - Trilhas sonoras / BGM
     * - Interseções diretas por colunas de ID (zero JSON)
     * - Strings e Temas relacionais
     */
    public function up(): void
    {
        // 1. Papéis na Indústria (Roles)
        if (!Schema::hasTable('catalog_roles')) {
            Schema::create('catalog_roles', function (Blueprint $table) {
                $table->string('id', 64)->primary();
                $table->string('token', 64)->unique();
            });
        }

        // 2. Criadores (Pessoas Físicas: Autores, Diretores, Músicos, Seiyuus)
        if (!Schema::hasTable('catalog_creators')) {
            Schema::create('catalog_creators', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name');
                $table->string('native_name')->nullable();
                $table->text('image_url')->nullable();
                $table->timestamps();
            });
        }

        // 3. Estúdios de Produção / Animação
        if (!Schema::hasTable('catalog_studios')) {
            Schema::create('catalog_studios', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('name');
                $table->text('image_url')->nullable();
                $table->timestamps();
            });
        }

        // 4. Interseção Pura: Obra <-> Criador com Papel Específico
        if (!Schema::hasTable('catalog_work_creators')) {
            Schema::create('catalog_work_creators', function (Blueprint $table) {
                $table->uuid('work_id');
                $table->uuid('creator_id');
                $table->string('role_id', 64);
                $table->primary(['work_id', 'creator_id', 'role_id']);
                $table->index('creator_id');
                $table->index('role_id');
            });
        }

        // 5. Interseção Pura: Obra <-> Estúdio
        if (!Schema::hasTable('catalog_work_studios')) {
            Schema::create('catalog_work_studios', function (Blueprint $table) {
                $table->uuid('work_id');
                $table->uuid('studio_id');
                $table->primary(['work_id', 'studio_id']);
                $table->index('studio_id');
            });
        }

        // 6. Trilhas Sonoras (BGM, Temas de Abertura / Encerramento, OST)
        if (!Schema::hasTable('catalog_tracks')) {
            Schema::create('catalog_tracks', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('composer_id')->nullable();
                $table->string('title');
                $table->string('track_type', 32)->default('bgm'); // bgm, op, ed, ost
                $table->integer('duration_seconds')->nullable();
                $table->timestamps();
                $table->index('composer_id');
            });
        }

        // 7. Interseção Pura: Obra / Episódio <-> Trilha Sonora
        if (!Schema::hasTable('catalog_work_tracks')) {
            Schema::create('catalog_work_tracks', function (Blueprint $table) {
                $table->uuid('work_id');
                $table->uuid('track_id');
                $table->uuid('episode_id')->nullable();
                $table->primary(['work_id', 'track_id']);
                $table->index('track_id');
                $table->index('episode_id');
            });
        }

        // 8. Tabela de Strings de Sistema (Zero Hardcode)
        if (!Schema::hasTable('system_strings')) {
            Schema::create('system_strings', function (Blueprint $table) {
                $table->string('token', 64)->primary();
                $table->text('pt_br');
                $table->text('en_us');
                $table->text('ja_jp')->nullable();
            });
        }

        // 9. Tabela de Temas de Sistema (Strings de Cores)
        if (!Schema::hasTable('system_themes')) {
            Schema::create('system_themes', function (Blueprint $table) {
                $table->string('token', 64)->primary();
                $table->string('amoled', 32);
                $table->string('cyberpunk', 32);
                $table->string('default_dark', 32);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('system_themes');
        Schema::dropIfExists('system_strings');
        Schema::dropIfExists('catalog_work_tracks');
        Schema::dropIfExists('catalog_tracks');
        Schema::dropIfExists('catalog_work_studios');
        Schema::dropIfExists('catalog_work_creators');
        Schema::dropIfExists('catalog_studios');
        Schema::dropIfExists('catalog_creators');
        Schema::dropIfExists('catalog_roles');
    }
};
