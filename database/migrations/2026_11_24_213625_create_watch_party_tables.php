<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('watch_party_rooms', function (Blueprint $table) {
            $table->id();
            $table->string('code', 12)->unique();
            $table->foreignId('leader_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('mode', 24)->default('party')->index();
            $table->uuid('work_id')->index();
            $table->uuid('episode_id')->nullable()->index();
            $table->unsignedInteger('episode_number')->nullable();
            $table->string('status', 24)->default('lobby_loading')->index();
            $table->double('playback_position_seconds')->default(0);
            $table->timestamp('playback_updated_at')->nullable();
            $table->timestamp('launch_at')->nullable();
            $table->double('live_edge_seconds')->default(0);
            $table->boolean('is_public')->default(false);
            $table->timestamps();
        });

        Schema::create('watch_party_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('watch_party_rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role', 16)->default('member');
            $table->boolean('is_ready')->default(false);
            $table->timestamp('last_seen_at')->index();
            $table->timestamps();

            $table->unique(['room_id', 'user_id']);
        });

        Schema::create('watch_party_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained('watch_party_rooms')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('body', 500);
            $table->timestamp('created_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('watch_party_messages');
        Schema::dropIfExists('watch_party_members');
        Schema::dropIfExists('watch_party_rooms');
    }
};
