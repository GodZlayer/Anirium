<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_identity_imports', function (Blueprint $table) {
            $table->string('sha256', 64)->primary();
            $table->uuid('generation');
            $table->unsignedInteger('records');
            $table->unsignedInteger('works')->default(0);
            $table->unsignedInteger('relations')->default(0);
            $table->unsignedInteger('pending_relations')->default(0);
            $table->boolean('complete')->default(false);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_identity_imports');
    }
};
