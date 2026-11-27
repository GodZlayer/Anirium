<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('watch_party_rooms')) {
            Schema::table('watch_party_rooms', function (Blueprint $table): void {
                if (! Schema::hasColumn('watch_party_rooms', 'phase')) {
                    $table->string('phase', 24)->default('playing');
                }
                if (! Schema::hasColumn('watch_party_rooms', 'sync_lock_until')) {
                    $table->timestamp('sync_lock_until')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('watch_party_rooms')) {
            Schema::table('watch_party_rooms', function (Blueprint $table): void {
                if (Schema::hasColumn('watch_party_rooms', 'sync_lock_until')) {
                    $table->dropColumn('sync_lock_until');
                }
                if (Schema::hasColumn('watch_party_rooms', 'phase')) {
                    $table->dropColumn('phase');
                }
            });
        }
    }
};
