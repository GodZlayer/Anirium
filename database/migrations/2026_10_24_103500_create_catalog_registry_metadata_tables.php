<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_registry_metadata', function (Blueprint $table) {
            $table->foreignUuid('entity_id')->primary()->constrained('catalog_works', 'id')->restrictOnDelete();
            $table->string('account_reference', 200);
            $table->text('media_history')->nullable();
        });
        Schema::create('catalog_source_redirects', function (Blueprint $table) {
            $table->string('from_reference', 128)->primary();
            $table->string('to_reference', 128);
            $table->string('evidence_key', 24);
            $table->text('evidence_json');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_source_redirects');
        Schema::dropIfExists('catalog_registry_metadata');
    }
};
