<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_work_child_revisions', function (Blueprint $table) {
            $table->foreignUuid('work_id')->primary()->constrained('catalog_works', 'id')->restrictOnDelete();
            $table->string('input_sha256', 64);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_work_child_revisions');
    }
};
