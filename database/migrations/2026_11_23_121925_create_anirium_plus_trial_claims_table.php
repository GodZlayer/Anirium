<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'anirium_plus_expires_at')) {
                $table->timestamp('anirium_plus_expires_at')->nullable()->after('tier');
            }
            if (! Schema::hasColumn('users', 'anirium_plus_trial_claimed_at')) {
                $table->timestamp('anirium_plus_trial_claimed_at')->nullable()->after('anirium_plus_expires_at');
            }
        });

        Schema::create('anirium_plus_trial_claims', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('google_id')->nullable()->unique();
            $table->string('network_fingerprint', 64)->unique();
            $table->string('raw_ip', 45);
            $table->timestamp('claimed_at');
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('anirium_plus_trial_claims');

        Schema::table('users', function (Blueprint $table): void {
            $columns = [];
            if (Schema::hasColumn('users', 'anirium_plus_expires_at')) {
                $columns[] = 'anirium_plus_expires_at';
            }
            if (Schema::hasColumn('users', 'anirium_plus_trial_claimed_at')) {
                $columns[] = 'anirium_plus_trial_claimed_at';
            }
            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
