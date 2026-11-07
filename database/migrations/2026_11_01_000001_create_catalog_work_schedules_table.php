<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Tabela de grade de exibição semanal para transmissões contínuas no Hero e Calendário.
     */
    public function up(): void
    {
        if (!Schema::hasTable('catalog_work_schedules')) {
            Schema::create('catalog_work_schedules', function (Blueprint $table) {
                $table->uuid('work_id')->primary();
                $table->string('airing_day', 16)->index();
                $table->string('airing_time', 8)->default('00:00')->index();
                $table->integer('latest_episode_num')->default(1)->index();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('catalog_work_schedules');
    }
};
