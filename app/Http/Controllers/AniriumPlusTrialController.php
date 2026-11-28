<?php

namespace App\Http\Controllers;

use App\Services\RealtimeEventStore;
use App\Support\IpNetworkFingerprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AniriumPlusTrialController extends Controller
{
    public const int TRIAL_DAYS = 15;

    public const float MONTHLY_PRICE_USD = 0.99;

    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json([
                'authenticated' => false,
                'is_plus' => false,
                'is_trial' => false,
                'trial_eligible' => false,
                'price_monthly_usd' => self::MONTHLY_PRICE_USD,
            ]);
        }

        $fingerprint = IpNetworkFingerprint::fromIp($request->ip());
        $googleId = trim((string) ($user->google_id ?? ''));
        $isPlus = $user->hasActiveAniriumPlus();
        $isTrial = $isPlus && $user->anirium_plus_trial_claimed_at !== null && $user->anirium_plus_expires_at !== null;

        $claimedOnAccount = $user->anirium_plus_trial_claimed_at !== null
            || DB::table('anirium_plus_trial_claims')
                ->where('user_id', $user->id)
                ->when($googleId !== '', fn ($q) => $q->orWhere('google_id', $googleId))
                ->exists();

        $claimedOnNetwork = $fingerprint !== null && DB::table('anirium_plus_trial_claims')
            ->where('network_fingerprint', $fingerprint)
            ->exists();

        $daysRemaining = ($isPlus && $user->anirium_plus_expires_at !== null)
            ? max(0, (int) ceil(now()->diffInSeconds($user->anirium_plus_expires_at, false) / 86400))
            : null;

        return response()->json([
            'authenticated' => true,
            'is_plus' => $isPlus,
            'is_trial' => $isTrial,
            'expires_at' => $user->anirium_plus_expires_at?->toIso8601String(),
            'days_remaining' => $daysRemaining,
            'requires_google' => $googleId === '',
            'trial_claimed_on_account' => $claimedOnAccount,
            'trial_claimed_on_network' => $claimedOnNetwork,
            'trial_eligible' => ! $isPlus && $googleId !== '' && ! $claimedOnAccount && ! $claimedOnNetwork,
            'trial_days' => self::TRIAL_DAYS,
            'price_monthly_usd' => self::MONTHLY_PRICE_USD,
        ]);
    }

    public function activate(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json([
                'success' => false,
                'code' => 'unauthenticated',
                'message' => 'Faça login com sua conta Google para ativar o período grátis do Anirium+.',
            ], 401);
        }

        $googleId = trim((string) ($user->google_id ?? ''));
        if ($googleId === '') {
            return response()->json([
                'success' => false,
                'code' => 'google_account_required',
                'message' => 'O período grátis de 15 dias requer uma conta vinculada ao Google.',
                'price_monthly_usd' => self::MONTHLY_PRICE_USD,
            ], 422);
        }

        if ($user->hasActiveAniriumPlus()) {
            return response()->json([
                'success' => true,
                'already_active' => true,
                'tier' => (int) $user->tier,
                'expires_at' => $user->anirium_plus_expires_at?->toIso8601String(),
                'price_monthly_usd' => self::MONTHLY_PRICE_USD,
            ]);
        }

        $rawIp = (string) $request->ip();
        $fingerprint = IpNetworkFingerprint::fromIp($rawIp);
        if ($fingerprint === null) {
            return response()->json([
                'success' => false,
                'code' => 'invalid_network',
                'message' => 'Não foi possível validar o endereço de rede/IPv6 para ativar o período grátis.',
            ], 422);
        }

        $now = now();
        $expiresAt = $now->copy()->addDays(self::TRIAL_DAYS);

        $result = DB::transaction(function () use ($user, $googleId, $fingerprint, $rawIp, $now, $expiresAt): array {
            $existingAccount = DB::table('anirium_plus_trial_claims')
                ->where('user_id', $user->id)
                ->orWhere('google_id', $googleId)
                ->first();

            if ($existingAccount !== null) {
                return [
                    'ok' => false,
                    'status' => 409,
                    'code' => 'trial_already_used_on_account',
                    'message' => 'Esta conta Google já utilizou os 15 dias grátis do Anirium+. Assine por US$ 0,99/mês para continuar.',
                ];
            }

            $existingNetwork = DB::table('anirium_plus_trial_claims')
                ->where('network_fingerprint', $fingerprint)
                ->first();

            if ($existingNetwork !== null) {
                return [
                    'ok' => false,
                    'status' => 409,
                    'code' => 'trial_already_used_on_network',
                    'message' => 'O limite de 1 conta Google por IPv6 para os 15 dias grátis já foi utilizado neste dispositivo/rede. Assine o Anirium+ por US$ 0,99/mês.',
                ];
            }

            DB::table('anirium_plus_trial_claims')->insert([
                'user_id' => $user->id,
                'google_id' => $googleId,
                'network_fingerprint' => $fingerprint,
                'raw_ip' => substr($rawIp, 0, 45),
                'claimed_at' => $now,
                'expires_at' => $expiresAt,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            if (! $user->isAdmin()) {
                $user->tier = 2;
            }
            $user->anirium_plus_trial_claimed_at = $now;
            $user->anirium_plus_expires_at = $expiresAt;
            $user->save();

            return [
                'ok' => true,
                'status' => 200,
                'code' => 'activated',
                'message' => 'Anirium+ ativado gratuitamente por 15 dias! Depois desse período, o plano custa US$ 0,99/mês.',
            ];
        });

        if (! $result['ok']) {
            return response()->json([
                'success' => false,
                'code' => $result['code'],
                'message' => $result['message'],
                'price_monthly_usd' => self::MONTHLY_PRICE_USD,
            ], $result['status']);
        }

        app(RealtimeEventStore::class)->publish('user:'.$user->id, 'subscription.updated', [
            'source' => 'trial',
            'tier' => (int) $user->tier,
            'expires_at' => $expiresAt->toIso8601String(),
        ]);

        return response()->json([
            'success' => true,
            'activated' => true,
            'tier' => (int) $user->tier,
            'trial_days' => self::TRIAL_DAYS,
            'expires_at' => $expiresAt->toIso8601String(),
            'days_remaining' => self::TRIAL_DAYS,
            'price_monthly_usd' => self::MONTHLY_PRICE_USD,
            'message' => $result['message'],
        ]);
    }
}
