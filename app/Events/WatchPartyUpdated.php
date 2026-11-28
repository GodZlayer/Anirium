<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WatchPartyUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $room
     */
    public function __construct(
        public string $code,
        public array $room,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('watch-party.'.strtoupper($this->code)),
        ];
    }

    public function broadcastAs(): string
    {
        return 'room.updated';
    }
}
