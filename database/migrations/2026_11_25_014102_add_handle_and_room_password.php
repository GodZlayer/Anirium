<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('handle', 48)->nullable()->unique()->after('email');
        });

        Schema::table('watch_party_rooms', function (Blueprint $table) {
            $table->string('password_hash', 255)->nullable()->after('is_public');
        });

        // Backfill handles from email prefix
        $used = [];
        foreach (DB::table('users')->orderBy('id')->get(['id', 'email']) as $user) {
            $prefix = strtolower(trim(explode('@', (string) $user->email)[0] ?? ''));
            $base = preg_replace('/[^a-z0-9._-]/', '', $prefix) ?: ('user'.$user->id);
            $base = substr($base, 0, 32);
            $candidate = $base;
            $suffix = 2;
            while (isset($used[$candidate])) {
                $candidate = substr($base, 0, 28).$suffix;
                $suffix++;
            }
            $used[$candidate] = true;
            DB::table('users')->where('id', $user->id)->update(['handle' => $candidate]);
        }
    }

    public function down(): void
    {
        Schema::table('watch_party_rooms', function (Blueprint $table) {
            $table->dropColumn('password_hash');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['handle']);
            $table->dropColumn('handle');
        });
    }
};
