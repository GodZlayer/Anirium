<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class EntityCommentPosted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param  array<string, mixed>  $comment
     */
    public function __construct(
        public string $entityType,
        public string $entityId,
        public array $comment,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new Channel("entity.{$this->entityType}.{$this->entityId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'comment.posted';
    }
}
