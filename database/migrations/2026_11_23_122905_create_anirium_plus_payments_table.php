<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('anirium_plus_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 32)->default('efi_pix');
            $table->string('txid', 64)->unique();
            $table->decimal('amount_brl', 8, 2);
            $table->string('status', 24)->default('pending')->index();
            $table->text('pix_copy_paste')->nullable();
            $table->text('qrcode_image')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('anirium_plus_payments');
    }
};
