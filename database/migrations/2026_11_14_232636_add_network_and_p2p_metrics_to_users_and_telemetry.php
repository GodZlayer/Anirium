<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'bytes_uploaded')) {
                $table->unsignedBigInteger('bytes_uploaded')->default(0)->after('active_minutes');
            }
            if (! Schema::hasColumn('users', 'bytes_downloaded')) {
                $table->unsignedBigInteger('bytes_downloaded')->default(0)->after('bytes_uploaded');
            }
            if (! Schema::hasColumn('users', 'seeding_seconds')) {
                $table->unsignedInteger('seeding_seconds')->default(0)->after('bytes_downloaded');
            }
            if (! Schema::hasColumn('users', 'seeding_xp')) {
                $table->unsignedInteger('seeding_xp')->default(0)->after('seeding_seconds');
            }
        });

        Schema::table('user_interaction_events', function (Blueprint $table) {
            if (! Schema::hasColumn('user_interaction_events', 'entity_id')) {
                $table->string('entity_id', 64)->nullable()->index()->after('target_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'bytes_uploaded',
                'bytes_downloaded',
                'seeding_seconds',
                'seeding_xp',
            ]);
        });

        Schema::table('user_interaction_events', function (Blueprint $table) {
            $table->dropColumn('entity_id');
        });
    }
};
