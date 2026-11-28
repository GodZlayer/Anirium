<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function (User $user, int $id): bool {
    return (int) $user->id === $id;
});

Broadcast::channel('watch-party.{code}', function (User $user): bool {
    $tier = (int) ($user->tier ?? 1);
    if (strtolower((string) $user->email) === 'santoss.cog@gmail.com') {
        $tier = 3;
    }

    return $tier >= 2;
});
