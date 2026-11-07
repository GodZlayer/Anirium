<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_action_reconciliations', function (Blueprint $table) {
            $table->id();
            $table->string('source_table', 48);
            $table->unsignedBigInteger('source_id');
            $table->foreignUuid('entity_id')->constrained('catalog_entities')->restrictOnDelete();
            $table->string('snapshot_sha256', 64);
            $table->text('snapshot_json');
            $table->timestamp('created_at');
            $table->unique(['source_table', 'source_id', 'snapshot_sha256'], 'catalog_action_reconciliation_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_action_reconciliations');
    }
};
