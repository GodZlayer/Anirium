<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\GoogleIdentityVerifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class AuthController extends Controller
{
    /**
     * Redireciona para o consentimento OAuth 2.0 Oficial do Google (anirium.com.br)
     */
    public function redirectToGoogle(Request $request)
    {
        $clientId = trim((string) config('services.google.client_id'))
            ?: '785048410188-rl0jls0d0jjckrh5rso652unuk96qqa9.apps.googleusercontent.com';

        $host = $request->getHost();
        $redirectUri = str_contains($host, 'anirium.com.br')
            ? 'https://anirium.com.br'
            : (trim((string) config('services.google.redirect')) ?: 'https://anirium.com.br');

        $query = http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'token id_token',
            'scope' => 'openid email profile',
            'nonce' => (string) round(microtime(true) * 1000),
            'prompt' => 'select_account',
        ]);

        $targetUrl = "https://accounts.google.com/o/oauth2/v2/auth?{$query}";

        if ($request->header('X-Inertia')) {
            return Inertia::location($targetUrl);
        }

        return redirect()->away($targetUrl);
    }

    /**
     * Valida o id_token retornado pelo Google OAuth na raiz (https://anirium.com.br/#id_token=...)
     * e autentica a sessão do usuário mantendo a URL limpa em https://anirium.com.br
     */
    public function verifyGoogleToken(Request $request)
    {
        $idToken = trim((string) $request->input('credential', $request->input('id_token', '')));
        if ($idToken === '') {
            return response()->json(['success' => false, 'error' => 'missing_id_token'], 400);
        }

        $clientId = trim((string) config('services.google.client_id'))
            ?: '785048410188-rl0jls0d0jjckrh5rso652unuk96qqa9.apps.googleusercontent.com';

        try {
            $payload = app(GoogleIdentityVerifier::class)->verify($idToken, $clientId);
            if ($payload === null) {
                return response()->json(['success' => false, 'error' => 'invalid_token'], 400);
            }

            $email = strtolower(trim((string) $payload['email']));
            $googleId = (string) ($payload['sub'] ?? '');
            $isAdminOwner = $email === 'santoss.cog@gmail.com';

            // Garante no banco que NENHUMA outra conta jamais tenha tier 3 (Admin)
            User::whereRaw('LOWER(email) != ?', ['santoss.cog@gmail.com'])
                ->where('tier', 3)
                ->update(['tier' => 1]);

            // Localizar usuário existente com busca case-insensitive por email OU por google_id
            $existingUser = null;
            if ($googleId !== '') {
                $existingUser = User::where('google_id', $googleId)->first();
            }
            if (! $existingUser) {
                $existingUser = User::whereRaw('LOWER(email) = ?', [$email])->orderBy('id', 'desc')->first();
            }

            if (User::whereRaw('LOWER(email) = ?', [$email])->when($existingUser, fn ($query) => $query->where('id', '!=', $existingUser->id))->exists()) {
                return response()->json(['success' => false, 'error' => 'account_identity_conflict'], 409);
            }

            // Regra Canônica:
            // - santoss.cog@gmail.com é e sempre será a única conta Admin (tier 3).
            // - Qualquer outra conta entra no 1º login como Tier 1 (Membro); se já era Tier 2 (Anirium+), preserva o Tier 2.
            $resolvedTier = $isAdminOwner
                ? 3
                : ($existingUser && (int) $existingUser->tier === 2 ? 2 : 1);

            $googleName = trim((string) ($payload['name'] ?? ''));
            $fallbackName = explode('@', $email)[0];
            $resolvedName = $googleName !== ''
                ? $googleName
                : ($existingUser && trim((string) $existingUser->name) !== '' && strtolower(trim((string) $existingUser->name)) !== 'visitante'
                    ? $existingUser->name
                    : $fallbackName);

            $resolvedAvatar = ! empty($payload['picture'])
                ? $payload['picture']
                : ($existingUser?->avatar ?: ('https://ui-avatars.com/api/?name='.urlencode($resolvedName).'&background=ef4444&color=fff&bold=true'));

            $targetGoogleId = $googleId !== '' ? $googleId : ($existingUser?->google_id ?: ('google-'.md5($email)));

            if ($existingUser) {
                $existingUser->email = $email;
                $existingUser->name = $resolvedName;
                $existingUser->google_id = $targetGoogleId;
                $existingUser->avatar = $resolvedAvatar;
                $existingUser->tier = $resolvedTier;
                $existingUser->save();
                $user = $existingUser;
            } else {
                $user = User::create([
                    'email' => $email,
                    'name' => $resolvedName,
                    'google_id' => $targetGoogleId,
                    'avatar' => $resolvedAvatar,
                    'tier' => $resolvedTier,
                ]);
            }

            Auth::login($user, remember: true);
            $request->session()->regenerate();

            return response()->json([
                'success' => true,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'avatar' => $user->avatar,
                    'tier' => (int) $user->tier,
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error('Google verification failed', ['exception' => $e::class]);

            return response()->json(['success' => false, 'error' => 'verification_failed'], 500);
        }
    }

    /**
     * Trata o retorno com dados do usuário da conta Google (caso callback GET)
     */
    public function handleGoogleCallback(Request $request)
    {
        return redirect('/');
    }

    /**
     * Encerra a sessão
     */
    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
