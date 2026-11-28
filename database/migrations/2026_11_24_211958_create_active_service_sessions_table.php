<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('active_service_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('device_id', 128)->index();
            $table->string('player_session_id', 128)->unique();
            $table->string('service_version', 32)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('status', 24)->default('idle')->index();
            $table->uuid('work_id')->nullable()->index();
            $table->uuid('episode_id')->nullable();
            $table->unsignedInteger('episode_number')->nullable();
            $table->unsignedInteger('position_seconds')->default(0);
            $table->json('diagnostics')->nullable();
            $table->timestamp('last_seen_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('active_service_sessions');
    }
};
