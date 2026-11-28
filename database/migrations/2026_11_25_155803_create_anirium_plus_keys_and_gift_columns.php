<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('anirium_plus_keys', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('plan', 16)->default('monthly');
            $table->unsignedInteger('days')->default(30);
            $table->foreignId('purchased_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('payment_txid', 64)->nullable()->index();
            $table->foreignId('redeemed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('redeemed_at')->nullable();
            $table->timestamps();
        });

        Schema::table('anirium_plus_payments', function (Blueprint $table): void {
            $table->string('plan', 16)->default('monthly')->after('provider');
            $table->string('purchase_mode', 16)->default('self')->after('plan');
            $table->foreignId('recipient_user_id')->nullable()->after('purchase_mode')->constrained('users')->nullOnDelete();
            $table->string('gift_key_code', 32)->nullable()->after('recipient_user_id');
            $table->decimal('price_usd', 8, 2)->nullable()->after('amount_brl');
            $table->decimal('exchange_rate', 8, 4)->nullable()->after('price_usd');
        });
    }

    public function down(): void
    {
        Schema::table('anirium_plus_payments', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('recipient_user_id');
            $table->dropColumn(['plan', 'purchase_mode', 'gift_key_code', 'price_usd', 'exchange_rate']);
        });

        Schema::dropIfExists('anirium_plus_keys');
    }
};
