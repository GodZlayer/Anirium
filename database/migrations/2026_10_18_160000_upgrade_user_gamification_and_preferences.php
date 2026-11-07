<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'active_minutes')) {
                $table->unsignedInteger('active_minutes')->default(0)->after('xp');
            }
            if (!Schema::hasColumn('users', 'current_streak')) {
                $table->unsignedInteger('current_streak')->default(0)->after('active_minutes');
            }
            if (!Schema::hasColumn('users', 'longest_streak')) {
                $table->unsignedInteger('longest_streak')->default(0)->after('current_streak');
            }
            if (!Schema::hasColumn('users', 'streak_xp')) {
                $table->unsignedInteger('streak_xp')->default(0)->after('longest_streak');
            }
            if (!Schema::hasColumn('users', 'last_presence_date')) {
                $table->date('last_presence_date')->nullable()->after('streak_xp');
            }
            if (!Schema::hasColumn('users', 'adult_content_enabled')) {
                $table->boolean('adult_content_enabled')->default(false)->after('last_presence_date');
            }
            if (!Schema::hasColumn('users', 'custom_title')) {
                $table->string('custom_title')->nullable()->after('adult_content_enabled');
            }
        });

        Schema::table('user_entity_preferences', function (Blueprint $table) {
            if (!Schema::hasColumn('user_entity_preferences', 'liked')) {
                $table->boolean('liked')->default(false)->after('bookmarked');
            }
            if (!Schema::hasColumn('user_entity_preferences', 'metadata')) {
                $table->jsonb('metadata')->nullable()->after('progress_seconds');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'active_minutes',
                'current_streak',
                'longest_streak',
                'streak_xp',
                'last_presence_date',
                'adult_content_enabled',
                'custom_title',
            ]);
        });

        Schema::table('user_entity_preferences', function (Blueprint $table) {
            $table->dropColumn(['liked', 'metadata']);
        });
    }
};
