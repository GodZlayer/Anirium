<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('age_verification_status', 24)->default('unverified')->index();
            $table->string('age_verification_method', 32)->nullable();
            $table->timestamp('age_verified_at')->nullable();
            $table->foreignId('age_verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('birth_date')->nullable();
            $table->string('age_verification_note', 255)->nullable();
        });

        Schema::create('age_verification_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status', 24)->default('pending')->index();
            $table->text('declared_birth_date');
            $table->timestamp('declaration_accepted_at');
            $table->string('evidence_note', 500)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('review_note', 255)->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('age_verification_requests');

        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'age_verified_by')) {
                $table->dropConstrainedForeignId('age_verified_by');
            }
            $columns = array_values(array_filter([
                'age_verification_status',
                'age_verification_method',
                'age_verified_at',
                'birth_date',
                'age_verification_note',
            ], static fn (string $column): bool => Schema::hasColumn('users', $column)));
            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
