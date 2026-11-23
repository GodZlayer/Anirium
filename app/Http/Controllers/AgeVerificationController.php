<?php

namespace App\Http\Controllers;

use App\Models\AgeVerificationRequest;
use App\Models\User;
use App\Support\GoogleAgeVerifier;
use App\Support\GoogleIdentityVerifier;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class AgeVerificationController extends Controller
{
    private const string DEFAULT_GOOGLE_CLIENT_ID = '785048410188-rl0jls0d0jjckrh5rso652unuk96qqa9.apps.googleusercontent.com';

    public function redirectToGoogle(Request $request): RedirectResponse
    {
        $user = Auth::user();
        if (! $user instanceof User) {
            return redirect('/auth/google');
        }

        if ($user->isUnderageBlocked()) {
            return redirect('/?age_verify=underage');
        }

        $state = bin2hex(random_bytes(16));
        $request->session()->put([
            'google_age_verify_state' => $state,
            'google_age_verify_state_expires' => now()->addMinutes(10)->timestamp,
        ]);

        $host = $request->getHost();
        $redirectUri = str_contains($host, 'anirium.com.br')
            ? 'https://anirium.com.br'
            : (trim((string) config('services.google.redirect')) ?: 'https://anirium.com.br');

        $query = http_build_query([
            'client_id' => $this->resolveGoogleClientId(),
            'redirect_uri' => $redirectUri,
            'response_type' => 'token id_token',
            'scope' => 'openid email profile https://www.googleapis.com/auth/user.birthday.read',
            'include_granted_scopes' => 'true',
            'login_hint' => $user->email,
            'nonce' => bin2hex(random_bytes(16)),
            'state' => 'age_verify:'.$state,
            'prompt' => 'consent',
        ]);

        return redirect()->away("https://accounts.google.com/o/oauth2/v2/auth?{$query}");
    }

    public function status(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (! $user instanceof User) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        return response()->json($this->buildStatusPayload($user));
    }

    public function verifyWithGoogle(
        Request $request,
        GoogleIdentityVerifier $idVerifier,
        GoogleAgeVerifier $ageVerifier,
    ): JsonResponse {
        $user = Auth::user();
        if (! $user instanceof User) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        $validated = $request->validate([
            'state' => ['required', 'string', 'max:255'],
            'id_token' => ['required', 'string'],
            'access_token' => ['required', 'string'],
        ]);

        $expectedState = (string) $request->session()->get('google_age_verify_state', '');
        $expiresAt = (int) $request->session()->get('google_age_verify_state_expires', 0);
        $request->session()->forget(['google_age_verify_state', 'google_age_verify_state_expires']);

        if ($expectedState === '' || $expiresAt < now()->timestamp || ! hash_equals('age_verify:'.$expectedState, $validated['state'])) {
            return response()->json(['error' => 'invalid_oauth_state'], 403);
        }

        $clientId = $this->resolveGoogleClientId();
        $idPayload = $idVerifier->verify($validated['id_token'], $clientId);
        if ($idPayload === null) {
            return response()->json(['error' => 'invalid_google_token'], 403);
        }

        $tokenEmail = strtolower(trim((string) ($idPayload['email'] ?? '')));
        $tokenSub = (string) ($idPayload['sub'] ?? '');
        $userGoogleId = (string) ($user->google_id ?? '');

        if (
            strtolower(trim((string) $user->email)) !== $tokenEmail
            || ($userGoogleId !== '' && ! str_starts_with($userGoogleId, 'google-') && ! hash_equals($userGoogleId, $tokenSub))
        ) {
            return response()->json(['error' => 'google_account_mismatch'], 403);
        }

        if (! $ageVerifier->verifyAccessToken($validated['access_token'], $clientId, $tokenSub)) {
            return response()->json(['error' => 'invalid_access_token'], 403);
        }

        $birthResult = $ageVerifier->fetchBirthDate($validated['access_token']);
        if (! $birthResult['ok']) {
            return response()->json([
                'status' => (string) ($user->age_verification_status ?: 'unverified'),
                'error' => $birthResult['error'] ?? 'birthday_unavailable',
                'fallback_available' => ! $user->isUnderageBlocked(),
            ], 422);
        }

        return $this->persistAgeOutcome(
            $user,
            $birthResult['birth_date'] ?? null,
            (int) ($birthResult['age'] ?? 0),
            'google_people',
            'Menor de 18 anos segundo conta Google.',
            'Verificado automaticamente via Google People API.',
            'Bloqueio automático: conta Google menor de 18 anos.',
        );
    }

    public function submitRequest(Request $request): JsonResponse
    {
        $user = Auth::user();
        if (! $user instanceof User) {
            return response()->json(['error' => 'unauthorized'], 401);
        }

        if ($user->isUnderageBlocked()) {
            return response()->json([
                'error' => 'underage_blocked',
                'status' => 'underage',
            ], 403);
        }

        $hasBirthDate = trim((string) ($user->birth_date ?? '')) !== '';
        if ($user->isAgeVerified() || $hasBirthDate) {
            return response()->json([
                'error' => 'birth_date_locked',
                'status' => (string) ($user->age_verification_status ?: 'verified'),
            ], 409);
        }

        $validated = $request->validate([
            'birth_date' => ['required', 'date_format:Y-m-d', 'before:today', 'after:1900-01-01'],
            'declaration_accepted' => ['required', 'accepted'],
        ]);

        $birthDate = CarbonImmutable::createFromFormat('Y-m-d', $validated['birth_date'], 'UTC')->startOfDay();
        $age = (int) $birthDate->diffInYears(CarbonImmutable::now('UTC'));

        return $this->persistAgeOutcome(
            $user,
            $birthDate->toDateString(),
            $age,
            'manual_immutable',
            'Data informada indica menor de 18 anos.',
            'Verificado por registro único de data de nascimento.',
            'Bloqueio automático: data informada indica menor de 18 anos.',
        );
    }

    private function persistAgeOutcome(
        User $user,
        ?string $birthDateString,
        int $age,
        string $method,
        string $underageNote,
        string $approvedNote,
        string $rejectedNote,
    ): JsonResponse {
        if ($age < User::MINIMUM_ADULT_AGE) {
            DB::transaction(function () use ($user, $birthDateString, $method, $underageNote, $rejectedNote): void {
                $user->age_verification_status = 'underage';
                $user->age_verification_method = $method;
                $user->age_verified_at = null;
                $user->age_verified_by = null;
                $user->birth_date = $birthDateString;
                $user->adult_content_enabled = false;
                $user->age_verification_note = $underageNote;
                $user->save();

                AgeVerificationRequest::where('user_id', $user->id)
                    ->where('status', 'pending')
                    ->update([
                        'status' => 'rejected',
                        'reviewed_at' => now(),
                        'review_note' => $rejectedNote,
                    ]);
            });

            return response()->json([
                'status' => 'underage',
                'error' => 'minimum_age_not_met',
                'minimum_age' => User::MINIMUM_ADULT_AGE,
            ], 403);
        }

        DB::transaction(function () use ($user, $birthDateString, $method, $approvedNote): void {
            $user->age_verification_status = 'verified';
            $user->age_verification_method = $method;
            $user->age_verified_at = now();
            $user->age_verified_by = null;
            $user->birth_date = $birthDateString;
            $user->age_verification_note = null;
            $user->save();

            AgeVerificationRequest::where('user_id', $user->id)
                ->where('status', 'pending')
                ->update([
                    'status' => 'approved',
                    'reviewed_at' => now(),
                    'review_note' => $approvedNote,
                ]);
        });

        return response()->json($this->buildStatusPayload($user->fresh() ?? $user));
    }

    public function adminIndex(Request $request): JsonResponse
    {
        $admin = Auth::user();
        if (! $admin instanceof User || ! $admin->isAdmin()) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $pending = AgeVerificationRequest::with('user')
            ->where('status', 'pending')
            ->orderBy('created_at')
            ->get()
            ->map(fn (AgeVerificationRequest $req): array => $this->formatAdminRequestRow($req))
            ->values();

        $recent = AgeVerificationRequest::with('user')
            ->whereIn('status', ['approved', 'rejected'])
            ->orderByDesc('reviewed_at')
            ->limit(20)
            ->get()
            ->map(fn (AgeVerificationRequest $req): array => $this->formatAdminRequestRow($req))
            ->values();

        return response()->json([
            'pending' => $pending,
            'recent' => $recent,
        ]);
    }

    public function adminApprove(Request $request, AgeVerificationRequest $ageVerificationRequest): JsonResponse
    {
        $admin = Auth::user();
        if (! $admin instanceof User || ! $admin->isAdmin()) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:255'],
        ]);

        $birthDateRaw = (string) ($ageVerificationRequest->declared_birth_date ?? '');
        try {
            $birthDate = CarbonImmutable::createFromFormat('Y-m-d', $birthDateRaw, 'UTC')->startOfDay();
        } catch (\Throwable) {
            return response()->json(['error' => 'invalid_declared_birth_date'], 422);
        }

        $age = (int) $birthDate->diffInYears(CarbonImmutable::now('UTC'));
        if ($age < User::MINIMUM_ADULT_AGE) {
            return response()->json(['error' => 'minimum_age_not_met'], 422);
        }

        $reviewNote = isset($validated['review_note']) ? trim((string) $validated['review_note']) : null;
        if ($reviewNote === '') {
            $reviewNote = null;
        }

        DB::transaction(function () use ($admin, $ageVerificationRequest, $birthDate, $reviewNote): void {
            $ageVerificationRequest->status = 'approved';
            $ageVerificationRequest->reviewed_by = $admin->id;
            $ageVerificationRequest->reviewed_at = now();
            $ageVerificationRequest->review_note = $reviewNote;
            $ageVerificationRequest->save();

            $targetUser = $ageVerificationRequest->user()->firstOrFail();
            $targetUser->age_verification_status = 'verified';
            $targetUser->age_verification_method = 'admin_approved';
            $targetUser->age_verified_at = now();
            $targetUser->age_verified_by = $admin->id;
            $targetUser->birth_date = $birthDate->toDateString();
            $targetUser->age_verification_note = $reviewNote;
            $targetUser->save();
        });

        return response()->json([
            'status' => 'approved',
            'request_id' => $ageVerificationRequest->id,
            'user_id' => $ageVerificationRequest->user_id,
        ]);
    }

    public function adminReject(Request $request, AgeVerificationRequest $ageVerificationRequest): JsonResponse
    {
        $admin = Auth::user();
        if (! $admin instanceof User || ! $admin->isAdmin()) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:255'],
        ]);

        $reviewNote = isset($validated['review_note']) ? trim((string) $validated['review_note']) : null;
        if ($reviewNote === '') {
            $reviewNote = 'Solicitação recusada pelo administrador.';
        }

        DB::transaction(function () use ($admin, $ageVerificationRequest, $reviewNote): void {
            $ageVerificationRequest->status = 'rejected';
            $ageVerificationRequest->reviewed_by = $admin->id;
            $ageVerificationRequest->reviewed_at = now();
            $ageVerificationRequest->review_note = $reviewNote;
            $ageVerificationRequest->save();

            $targetUser = $ageVerificationRequest->user()->firstOrFail();
            $targetUser->age_verification_status = 'rejected';
            $targetUser->age_verified_at = null;
            $targetUser->age_verified_by = null;
            $targetUser->adult_content_enabled = false;
            $targetUser->age_verification_note = $reviewNote;
            $targetUser->save();
        });

        return response()->json([
            'status' => 'rejected',
            'request_id' => $ageVerificationRequest->id,
            'user_id' => $ageVerificationRequest->user_id,
        ]);
    }

    public function adminRevoke(Request $request, User $user): JsonResponse
    {
        $admin = Auth::user();
        if (! $admin instanceof User || ! $admin->isAdmin()) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:255'],
        ]);

        $reviewNote = isset($validated['review_note']) ? trim((string) $validated['review_note']) : null;
        if ($reviewNote === '') {
            $reviewNote = 'Verificação revogada pelo administrador.';
        }

        $user->age_verification_status = 'unverified';
        $user->age_verification_method = null;
        $user->age_verified_at = null;
        $user->age_verified_by = null;
        $user->adult_content_enabled = false;
        $user->age_verification_note = $reviewNote;
        $user->save();

        return response()->json([
            'status' => 'revoked',
            'user_id' => $user->id,
            'age_verification_status' => $user->age_verification_status,
            'adult_content_enabled' => false,
        ]);
    }

    private function resolveGoogleClientId(): string
    {
        return trim((string) config('services.google.client_id')) ?: self::DEFAULT_GOOGLE_CLIENT_ID;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildStatusPayload(User $user): array
    {
        $pending = AgeVerificationRequest::where('user_id', $user->id)
            ->where('status', 'pending')
            ->latest('id')
            ->first();

        $lastRejected = null;
        if ($user->age_verification_status === 'rejected') {
            $lastRejected = AgeVerificationRequest::where('user_id', $user->id)
                ->where('status', 'rejected')
                ->latest('id')
                ->first();
        }

        return [
            'minimum_age' => User::MINIMUM_ADULT_AGE,
            'age_verification_status' => (string) ($user->age_verification_status ?? 'unverified'),
            'age_verification_method' => $user->age_verification_method,
            'age_verified' => $user->isAgeVerified(),
            'age_verified_at' => $user->age_verified_at?->toISOString(),
            'adult_content_enabled' => $user->canAccessAdultContent(),
            'can_access_adult_content' => $user->canAccessAdultContent(),
            'pending_request' => $pending ? [
                'id' => $pending->id,
                'status' => $pending->status,
                'evidence_note' => $pending->evidence_note,
                'created_at' => $pending->created_at?->toISOString(),
            ] : null,
            'last_rejection_note' => $lastRejected?->review_note ?? $user->age_verification_note,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatAdminRequestRow(AgeVerificationRequest $req): array
    {
        $targetUser = $req->user;
        $birthDateRaw = (string) ($req->declared_birth_date ?? '');
        $declaredAge = null;
        if ($birthDateRaw !== '') {
            try {
                $declaredAge = (int) CarbonImmutable::createFromFormat('Y-m-d', $birthDateRaw, 'UTC')
                    ->startOfDay()
                    ->diffInYears(CarbonImmutable::now('UTC'));
            } catch (\Throwable) {
                $declaredAge = null;
            }
        }

        return [
            'id' => $req->id,
            'user_id' => $req->user_id,
            'user_name' => $targetUser?->name,
            'user_email' => $targetUser?->email,
            'user_tier' => $targetUser ? (int) $targetUser->tier : null,
            'user_age_status' => $targetUser?->age_verification_status,
            'status' => $req->status,
            'declared_birth_date' => $birthDateRaw !== '' ? $birthDateRaw : null,
            'declared_age' => $declaredAge,
            'evidence_note' => $req->evidence_note,
            'review_note' => $req->review_note,
            'created_at' => $req->created_at?->toISOString(),
            'reviewed_at' => $req->reviewed_at?->toISOString(),
        ];
    }
}
