<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Support\ServiceSessionSnapshot;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable([
    'name',
    'email',
    'handle',
    'password',
    'google_id',
    'avatar',
    'tier',
    'anirium_plus_expires_at',
    'anirium_plus_trial_claimed_at',
    'level',
    'xp',
    'active_minutes',
    'bytes_uploaded',
    'bytes_downloaded',
    'seeding_seconds',
    'seeding_xp',
    'current_streak',
    'longest_streak',
    'streak_xp',
    'last_presence_date',
    'adult_content_enabled',
    'custom_title',
    'age_verification_status',
    'age_verification_method',
    'age_verified_at',
    'age_verified_by',
    'birth_date',
    'age_verification_note',
])]
#[Hidden(['password', 'remember_token', 'birth_date'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    public const int MINIMUM_ADULT_AGE = 18;

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'age_verification_status' => 'unverified',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'adult_content_enabled' => 'boolean',
            'age_verified_at' => 'datetime',
            'anirium_plus_expires_at' => 'datetime',
            'anirium_plus_trial_claimed_at' => 'datetime',
            'birth_date' => 'encrypted',
        ];
    }

    protected static function booted(): void
    {
        static::saved(fn (self $user) => ServiceSessionSnapshot::forget((int) $user->id));
        static::deleted(fn (self $user) => ServiceSessionSnapshot::forget((int) $user->id));
    }

    public function isAgeVerified(): bool
    {
        return $this->age_verification_status === 'verified' && $this->age_verified_at !== null;
    }

    public function isUnderageBlocked(): bool
    {
        return $this->age_verification_status === 'underage';
    }

    public function canAccessAdultContent(): bool
    {
        return (bool) $this->adult_content_enabled && $this->isAgeVerified();
    }

    public function isAdmin(): bool
    {
        return (int) $this->tier === 3 && strtolower(trim((string) $this->email)) === 'santoss.cog@gmail.com';
    }

    public function hasActiveAniriumPlus(): bool
    {
        if ($this->isAdmin()) {
            return true;
        }

        if ((int) $this->tier !== 2) {
            return false;
        }

        if ($this->anirium_plus_expires_at !== null && $this->anirium_plus_expires_at->isPast()) {
            return false;
        }

        return true;
    }
}
