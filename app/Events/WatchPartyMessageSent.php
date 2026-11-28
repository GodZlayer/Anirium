<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WatchPartyMessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $message
     */
    public function __construct(
        public string $code,
        public array $message,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('watch-party.'.strtoupper($this->code)),
        ];
    }

    public function broadcastAs(): string
    {
        return 'chat.message';
    }
}
