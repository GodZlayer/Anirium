<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('catalog_arc_works', function (Blueprint $table) {
            $table->uuid('arc_id');
            $table->uuid('universe_id');
            $table->uuid('work_id');
            $table->unsignedInteger('start_number')->nullable();
            $table->unsignedInteger('end_number')->nullable();
            $table->primary(['arc_id', 'work_id']);
            $table->foreign(['arc_id', 'universe_id'])->references(['id', 'universe_id'])->on('catalog_arcs')->restrictOnDelete();
            $table->foreign(['universe_id', 'work_id'])->references(['universe_id', 'work_id'])->on('catalog_universe_works')->restrictOnDelete();
        });
        DB::table('catalog_arc_works')->insertUsing(['arc_id', 'universe_id', 'work_id'], DB::table('catalog_arc_episodes')->select('arc_id', 'universe_id', 'work_id')->distinct());
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('catalog_arc_works');
    }
};
