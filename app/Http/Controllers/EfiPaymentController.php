<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\EfiPixService;
use App\Services\RealtimeEventStore;
use App\Services\UsdExchangeRateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class EfiPaymentController extends Controller
{
    public const int MONTHLY_DAYS = 30;

    public const int ANNUAL_DAYS = 365;

    public const float MONTHLY_PRICE_USD = 0.99;

    public const float ANNUAL_PRICE_USD = 9.99;

    public function __construct(
        public EfiPixService $efi,
        public UsdExchangeRateService $exchangeRates,
    ) {}

    public function pricing(): JsonResponse
    {
        $rate = $this->exchangeRates->getRate();

        return response()->json([
            'success' => true,
            'sandbox' => (bool) config('services.efi.sandbox', false),
            'rate' => $rate,
            'plans' => [
                'monthly' => [
                    'usd' => self::MONTHLY_PRICE_USD,
                    'brl' => round(self::MONTHLY_PRICE_USD * $rate['effective_rate'], 2),
                    'days' => self::MONTHLY_DAYS,
                ],
                'annual' => [
                    'usd' => self::ANNUAL_PRICE_USD,
                    'brl' => round(self::ANNUAL_PRICE_USD * $rate['effective_rate'], 2),
                    'days' => self::ANNUAL_DAYS,
                ],
            ],
        ]);
    }

    public function lookupUser(Request $request): JsonResponse
    {
        if (! $request->user()) {
            return response()->json(['found' => false, 'message' => 'Faça login primeiro.'], 401);
        }

        $raw = trim((string) $request->query('handle', ''));
        $handle = ltrim($raw, '@');

        if ($handle === '' || mb_strlen($handle) < 2) {
            return response()->json(['found' => false, 'message' => 'Digite um @ válido.'], 422);
        }

        $target = User::query()
            ->whereRaw('LOWER(handle) = ?', [mb_strtolower($handle)])
            ->first();

        if (! $target) {
            return response()->json([
                'found' => false,
                'message' => 'Nenhum usuário encontrado com @'.$handle.'.',
            ], 404);
        }

        return response()->json([
            'found' => true,
            'user' => [
                'id' => $target->id,
                'name' => $target->name,
                'handle' => $target->handle,
                'avatar' => $target->avatar,
                'is_plus' => $target->hasActiveAniriumPlus(),
            ],
        ]);
    }

    public function createPixCharge(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json([
                'success' => false,
                'message' => 'Faça login para gerar o Pix do Anirium+.',
            ], 401);
        }

        if (! $this->efi->isConfigured()) {
            return response()->json([
                'success' => false,
                'code' => 'efi_not_configured',
                'message' => 'Pagamento Pix Efí Bank ainda não configurado no servidor.',
            ], 503);
        }

        $resolved = $this->resolvePurchaseInput($request);
        if (isset($resolved['error'])) {
            return response()->json([
                'success' => false,
                'message' => $resolved['error'],
            ], $resolved['status']);
        }

        $txid = 'ANIRIUM'.strtoupper(Str::random(24));
        $description = $this->buildChargeDescription(
            $resolved['plan'],
            $resolved['price_usd'],
            $resolved['mode'],
            $resolved['recipient'],
            $user
        );

        try {
            $charge = $this->efi->createImmediateCharge(
                $txid,
                $resolved['amount_brl'],
                $description
            );
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'code' => 'efi_charge_failed',
                'message' => $e->getMessage(),
            ], 502);
        }

        $now = now();
        $expiresAt = $now->copy()->addSeconds($charge['expires_in']);

        DB::table('anirium_plus_payments')->insert([
            'user_id' => $user->id,
            'provider' => 'efi_pix',
            'plan' => $resolved['plan'],
            'purchase_mode' => $resolved['mode'],
            'recipient_user_id' => $resolved['recipient']?->id,
            'txid' => $charge['txid'],
            'amount_brl' => $charge['amount_brl'],
            'price_usd' => $resolved['price_usd'],
            'exchange_rate' => $resolved['effective_rate'],
            'status' => 'pending',
            'pix_copy_paste' => $charge['pix_copy_paste'],
            'qrcode_image' => $charge['qrcode_image'],
            'expires_at' => $expiresAt,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return response()->json([
            'success' => true,
            'plan' => $resolved['plan'],
            'mode' => $resolved['mode'],
            'recipient_handle' => $resolved['recipient']?->handle,
            'days' => $resolved['days'],
            'price_usd' => $resolved['price_usd'],
            'exchange_rate' => $resolved['effective_rate'],
            'txid' => $charge['txid'],
            'amount_brl' => $charge['amount_brl'],
            'pix_copy_paste' => $charge['pix_copy_paste'],
            'qrcode_image' => $charge['qrcode_image'],
            'expires_at' => $expiresAt->toIso8601String(),
        ]);
    }

    public function createCheckoutLink(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Faça login para assinar o Anirium+.'], 401);
        }

        if (! $this->efi->isConfigured()) {
            return response()->json(['success' => false, 'message' => 'Efí Bank não configurado no servidor.'], 503);
        }

        $resolved = $this->resolvePurchaseInput($request);
        if (isset($resolved['error'])) {
            return response()->json([
                'success' => false,
                'message' => $resolved['error'],
            ], $resolved['status']);
        }

        $itemName = $this->buildChargeDescription(
            $resolved['plan'],
            $resolved['price_usd'],
            $resolved['mode'],
            $resolved['recipient'],
            $user
        );

        try {
            $link = $this->efi->createPaymentLink(
                $resolved['amount_brl'],
                $itemName
            );
        } catch (Throwable $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 502);
        }

        $now = now();
        $txid = 'EFILINK-'.$link['charge_id'];

        DB::table('anirium_plus_payments')->insert([
            'user_id' => $user->id,
            'provider' => 'efi_link',
            'plan' => $resolved['plan'],
            'purchase_mode' => $resolved['mode'],
            'recipient_user_id' => $resolved['recipient']?->id,
            'txid' => $txid,
            'amount_brl' => $link['amount_brl'],
            'price_usd' => $resolved['price_usd'],
            'exchange_rate' => $resolved['effective_rate'],
            'status' => 'pending',
            'pix_copy_paste' => $link['payment_url'],
            'expires_at' => $now->copy()->addDays(3),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return response()->json([
            'success' => true,
            'plan' => $resolved['plan'],
            'mode' => $resolved['mode'],
            'recipient_handle' => $resolved['recipient']?->handle,
            'days' => $resolved['days'],
            'price_usd' => $resolved['price_usd'],
            'exchange_rate' => $resolved['effective_rate'],
            'txid' => $txid,
            'charge_id' => $link['charge_id'],
            'amount_brl' => $link['amount_brl'],
            'payment_url' => $link['payment_url'],
        ]);
    }

    public function checkStatus(Request $request, string $txid): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['success' => false], 401);
        }

        $payment = DB::table('anirium_plus_payments')
            ->where('txid', $txid)
            ->where('user_id', $user->id)
            ->first();

        if (! $payment) {
            return response()->json(['success' => false, 'code' => 'not_found'], 404);
        }

        if ($payment->status === 'pending') {
            $this->settleVerifiedPayment($txid);
            $payment = DB::table('anirium_plus_payments')
                ->where('txid', $txid)
                ->where('user_id', $user->id)
                ->first();
        }

        $recipientHandle = null;
        if ($payment->recipient_user_id !== null) {
            $recipientHandle = User::query()->whereKey($payment->recipient_user_id)->value('handle');
        }

        return response()->json([
            'success' => true,
            'txid' => $payment->txid,
            'status' => $payment->status,
            'paid_at' => $payment->paid_at,
            'purchase_mode' => $payment->purchase_mode ?? 'self',
            'gift_key_code' => $payment->gift_key_code,
            'recipient_handle' => $recipientHandle,
        ]);
    }

    public function redeemKey(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['success' => false, 'message' => 'Faça login para resgatar uma key.'], 401);
        }

        $code = strtoupper(preg_replace('/\s+/', '', (string) $request->input('code', '')));
        if ($code === '') {
            return response()->json(['success' => false, 'message' => 'Informe o código da key Anirium+.'], 422);
        }

        $result = DB::transaction(function () use ($code, $user): array {
            $key = DB::table('anirium_plus_keys')
                ->where('code', $code)
                ->lockForUpdate()
                ->first();

            if (! $key) {
                return ['ok' => false, 'status' => 404, 'message' => 'Key não encontrada. Verifique o código digitado.'];
            }

            if ($key->redeemed_at !== null) {
                return ['ok' => false, 'status' => 409, 'message' => 'Esta key já foi resgatada anteriormente.'];
            }

            $now = now();
            DB::table('anirium_plus_keys')
                ->where('id', $key->id)
                ->update([
                    'redeemed_by_user_id' => $user->id,
                    'redeemed_at' => $now,
                    'updated_at' => $now,
                ]);

            $days = max(1, (int) $key->days);
            $baseExpiry = ($user->anirium_plus_expires_at !== null && $user->anirium_plus_expires_at->isFuture())
                ? $user->anirium_plus_expires_at->copy()
                : $now->copy();

            if (! $user->isAdmin()) {
                $user->tier = 2;
            }
            $user->anirium_plus_expires_at = $baseExpiry->addDays($days);
            $user->save();

            return [
                'ok' => true,
                'status' => 200,
                'days_added' => $days,
                'expires_at' => $user->anirium_plus_expires_at->toIso8601String(),
                'message' => sprintf('Key resgatada com sucesso! +%d dias de Anirium+ adicionados à sua conta.', $days),
            ];
        });

        if (! $result['ok']) {
            return response()->json(['success' => false, 'message' => $result['message']], $result['status']);
        }

        app(RealtimeEventStore::class)->publish('user:'.$user->id, 'subscription.updated', [
            'source' => 'key_redeem',
            'tier' => (int) $user->tier,
            'days_added' => $result['days_added'],
            'expires_at' => $result['expires_at'],
        ]);

        return response()->json([
            'success' => true,
            'days_added' => $result['days_added'],
            'expires_at' => $result['expires_at'],
            'message' => $result['message'],
        ]);
    }

    public function myKeys(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['success' => false, 'keys' => []], 401);
        }

        $keys = DB::table('anirium_plus_keys')
            ->leftJoin('users as redeemer', 'redeemer.id', '=', 'anirium_plus_keys.redeemed_by_user_id')
            ->where('anirium_plus_keys.purchased_by_user_id', $user->id)
            ->orderByDesc('anirium_plus_keys.id')
            ->limit(25)
            ->get([
                'anirium_plus_keys.code',
                'anirium_plus_keys.plan',
                'anirium_plus_keys.days',
                'anirium_plus_keys.redeemed_at',
                'anirium_plus_keys.created_at',
                'redeemer.handle as redeemed_by_handle',
            ]);

        return response()->json([
            'success' => true,
            'keys' => $keys,
        ]);
    }

    public function webhook(Request $request): JsonResponse
    {
        $expectedSecret = trim((string) config('services.efi.webhook_secret'));
        if ($expectedSecret !== '') {
            $provided = (string) ($request->query('secret') ?: $request->header('X-Efi-Webhook-Secret', ''));
            if (! hash_equals($expectedSecret, $provided)) {
                return response()->json(['error' => 'invalid_webhook_secret'], 403);
            }
        }

        $events = $request->input('pix', []);
        if (! is_array($events)) {
            return response()->json(['ok' => true, 'processed' => 0]);
        }

        $processed = 0;
        foreach ($events as $event) {
            $txid = is_array($event) ? trim((string) ($event['txid'] ?? '')) : '';
            if ($txid === '') {
                continue;
            }

            if ($this->settleVerifiedPayment($txid)) {
                $processed++;
            }
        }

        return response()->json(['ok' => true, 'processed' => $processed]);
    }

    /**
     * @return array{plan: string, mode: string, recipient: ?User, days: int, price_usd: float, effective_rate: float, amount_brl: float}|array{error: string, status: int}
     */
    private function resolvePurchaseInput(Request $request): array
    {
        $plan = $request->input('plan') === 'annual' ? 'annual' : 'monthly';
        $mode = match ($request->input('mode')) {
            'gift_user' => 'gift_user',
            'gift_key' => 'gift_key',
            default => 'self',
        };

        $recipient = null;
        if ($mode === 'gift_user') {
            $rawHandle = trim((string) $request->input('recipient_handle', ''));
            $handle = ltrim($rawHandle, '@');
            if ($handle === '') {
                return ['error' => 'Informe o @ do usuário que vai receber o presente.', 'status' => 422];
            }

            $recipient = User::query()
                ->whereRaw('LOWER(handle) = ?', [mb_strtolower($handle)])
                ->first();

            if (! $recipient) {
                return ['error' => 'Usuário @'.$handle.' não encontrado.', 'status' => 404];
            }
        }

        $priceUsd = $plan === 'annual' ? self::ANNUAL_PRICE_USD : self::MONTHLY_PRICE_USD;
        $days = $plan === 'annual' ? self::ANNUAL_DAYS : self::MONTHLY_DAYS;
        $rate = $this->exchangeRates->getRate();
        $amountBrl = round($priceUsd * $rate['effective_rate'], 2);

        return [
            'plan' => $plan,
            'mode' => $mode,
            'recipient' => $recipient,
            'days' => $days,
            'price_usd' => $priceUsd,
            'effective_rate' => $rate['effective_rate'],
            'amount_brl' => $amountBrl,
        ];
    }

    private function buildChargeDescription(
        string $plan,
        float $priceUsd,
        string $mode,
        ?User $recipient,
        User $buyer,
    ): string {
        $planLabel = $plan === 'annual' ? 'Annual / Anual' : 'Monthly / Mensal';

        return match ($mode) {
            'gift_user' => sprintf('Anirium+ %s Gift for @%s (US$ %.2f)', $planLabel, $recipient?->handle ?? 'user', $priceUsd),
            'gift_key' => sprintf('Anirium+ %s Gift Key (US$ %.2f)', $planLabel, $priceUsd),
            default => sprintf('Anirium+ %s (US$ %.2f) — #%d', $planLabel, $priceUsd, $buyer->id),
        };
    }

    private function generateUniqueKeyCode(): string
    {
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $parts = [];
            for ($g = 0; $g < 3; $g++) {
                $segment = '';
                for ($i = 0; $i < 4; $i++) {
                    $segment .= $alphabet[random_int(0, strlen($alphabet) - 1)];
                }
                $parts[] = $segment;
            }
            $code = 'ANIRIUM-'.implode('-', $parts);
        } while (DB::table('anirium_plus_keys')->where('code', $code)->exists());

        return $code;
    }

    /**
     * Always re-verifies the charge directly with Efí Bank before activating Anirium+,
     * crediting a gifted user, or issuing a gift key.
     */
    private function settleVerifiedPayment(string $txid): bool
    {
        $payment = DB::table('anirium_plus_payments')
            ->where('txid', $txid)
            ->first();

        if (! $payment || $payment->status === 'paid') {
            return false;
        }

        try {
            if ($payment->provider === 'efi_link') {
                $chargeId = str_starts_with($txid, 'EFILINK-') ? substr($txid, 8) : $txid;
                $paid = $this->efi->verifyChargeLinkPaid($chargeId);
            } else {
                $verification = $this->efi->verifyChargePaid($txid, (float) $payment->amount_brl);
                $paid = $verification['paid'];
            }
        } catch (Throwable) {
            return false;
        }

        if (! $paid) {
            return false;
        }

        return DB::transaction(function () use ($txid): bool {
            $locked = DB::table('anirium_plus_payments')
                ->where('txid', $txid)
                ->lockForUpdate()
                ->first();

            if (! $locked || $locked->status === 'paid') {
                return false;
            }

            $now = now();
            $plan = ($locked->plan ?? '') === 'annual' || ((float) $locked->amount_brl) >= 40.0
                ? 'annual'
                : 'monthly';
            $daysToAdd = $plan === 'annual' ? self::ANNUAL_DAYS : self::MONTHLY_DAYS;
            $mode = $locked->purchase_mode ?? 'self';
            $giftKeyCode = null;

            if ($mode === 'gift_key') {
                $giftKeyCode = $this->generateUniqueKeyCode();
                DB::table('anirium_plus_keys')->insert([
                    'code' => $giftKeyCode,
                    'plan' => $plan,
                    'days' => $daysToAdd,
                    'purchased_by_user_id' => $locked->user_id,
                    'payment_txid' => $locked->txid,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            } elseif ($mode === 'gift_user' && $locked->recipient_user_id !== null) {
                $recipient = User::query()->find($locked->recipient_user_id);
                if ($recipient) {
                    $baseExpiry = ($recipient->anirium_plus_expires_at !== null && $recipient->anirium_plus_expires_at->isFuture())
                        ? $recipient->anirium_plus_expires_at->copy()
                        : $now->copy();

                    if (! $recipient->isAdmin()) {
                        $recipient->tier = 2;
                    }
                    $recipient->anirium_plus_expires_at = $baseExpiry->addDays($daysToAdd);
                    $recipient->save();
                }
            } else {
                $user = User::query()->find($locked->user_id);
                if ($user) {
                    $baseExpiry = ($user->anirium_plus_expires_at !== null && $user->anirium_plus_expires_at->isFuture())
                        ? $user->anirium_plus_expires_at->copy()
                        : $now->copy();

                    if (! $user->isAdmin()) {
                        $user->tier = 2;
                    }
                    if ($user->anirium_plus_trial_claimed_at === null) {
                        $daysToAdd += AniriumPlusTrialController::TRIAL_DAYS;
                        $user->anirium_plus_trial_claimed_at = $now;
                    }
                    $user->anirium_plus_expires_at = $baseExpiry->addDays($daysToAdd);
                    $user->save();
                }
            }

            DB::table('anirium_plus_payments')
                ->where('id', $locked->id)
                ->update([
                    'status' => 'paid',
                    'paid_at' => $now,
                    'gift_key_code' => $giftKeyCode,
                    'updated_at' => $now,
                ]);

            $events = app(RealtimeEventStore::class);
            $events->publish('user:'.$locked->user_id, 'pix.paid', [
                'txid' => $txid,
                'mode' => $mode,
                'gift_key_code' => $giftKeyCode,
                'status' => 'paid',
            ]);
            if ($mode === 'gift_user' && $locked->recipient_user_id !== null) {
                $events->publish('user:'.$locked->recipient_user_id, 'subscription.updated', [
                    'source' => 'gift_user',
                    'tier' => 2,
                ]);
            } elseif ($mode !== 'gift_key') {
                $events->publish('user:'.$locked->user_id, 'subscription.updated', [
                    'source' => 'pix',
                    'tier' => 2,
                ]);
            }

            return true;
        });
    }
}
