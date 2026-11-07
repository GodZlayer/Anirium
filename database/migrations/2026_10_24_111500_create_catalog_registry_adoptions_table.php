<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_registry_adoptions', function (Blueprint $table) {
            $table->uuid('generation')->primary();
            $table->string('registry_sha256', 64);
            $table->unsignedInteger('works');
            $table->unsignedInteger('redirects');
            $table->timestampTz('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_registry_adoptions');
    }
};
