<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('catalog_external_identities', function (Blueprint $table) {
            $table->string('external_id', 512)->change();
        });
    }

    public function down(): void
    {
        // Retain the wider column: shrinking would destroy valid provider slugs.
    }
};
