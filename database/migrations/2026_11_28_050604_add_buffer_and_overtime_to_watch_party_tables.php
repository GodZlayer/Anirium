<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('watch_party_rooms', function (Blueprint $table): void {
            if (! Schema::hasColumn('watch_party_rooms', 'sync_overtime_until')) {
                $table->timestamp('sync_overtime_until')->nullable()->after('sync_lock_until');
            }
        });

        Schema::table('watch_party_members', function (Blueprint $table): void {
            if (! Schema::hasColumn('watch_party_members', 'buffered_seconds')) {
                $table->unsignedInteger('buffered_seconds')->default(0)->after('is_ready');
            }
        });
    }

    public function down(): void
    {
        Schema::table('watch_party_rooms', function (Blueprint $table): void {
            if (Schema::hasColumn('watch_party_rooms', 'sync_overtime_until')) {
                $table->dropColumn('sync_overtime_until');
            }
        });

        Schema::table('watch_party_members', function (Blueprint $table): void {
            if (Schema::hasColumn('watch_party_members', 'buffered_seconds')) {
                $table->dropColumn('buffered_seconds');
            }
        });
    }
};
