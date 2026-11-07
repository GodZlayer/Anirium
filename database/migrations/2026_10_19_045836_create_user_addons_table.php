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
        Schema::create('user_addons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('addon_id'); // Ex: 'player-pro', 'community-torrentio', etc.
            $table->string('name')->nullable();
            $table->string('version')->default('1.0.0');
            $table->string('type')->default('community'); // 'official-plus' ou 'community'
            $table->string('manifest_url')->nullable(); // Para manifestos remotos (Stremio / Web)
            $table->json('manifest_json')->nullable(); // Manifest parseado / cacheado
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->unique(['user_id', 'addon_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_addons');
    }
};
