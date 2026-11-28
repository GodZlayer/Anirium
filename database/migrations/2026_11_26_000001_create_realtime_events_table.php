<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('realtime_events')) {
            return;
        }

        Schema::create('realtime_events', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('channel', 191);
            $table->string('event', 80);
            $table->json('payload');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['channel', 'id'], 'realtime_events_channel_id_idx');
            $table->index('created_at', 'realtime_events_created_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('realtime_events');
    }
};
