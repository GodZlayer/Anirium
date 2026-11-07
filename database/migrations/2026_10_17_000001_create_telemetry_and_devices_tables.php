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
        // 1. Controle de Dispositivo Ativo Único por Usuário (Prevenção de 2 sessões simultâneas)
        Schema::create('active_user_devices', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->primary();
            $table->string('machine_fingerprint', 64)->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('last_ping_at')->useCurrent();
            $table->timestamps();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });

        // 2. Tabela Unificada de Eventos Indexados de Telemetria e Interações (Guests & Logados)
        Schema::create('user_interaction_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('machine_fingerprint', 64)->index();
            $table->string('target_type', 32)->index(); // 'global', 'universe', 'work', 'season', 'episode', 'arc'
            $table->string('target_id', 64)->index();
            $table->string('event_type', 32)->index(); // 'presence_ping', 'dwell_time', 'playback_heartbeat', 'like', 'favorite', 'rate', 'comment'
            $table->jsonb('payload')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();

            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_interaction_events');
        Schema::dropIfExists('active_user_devices');
    }
};
