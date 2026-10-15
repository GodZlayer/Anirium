// Reuse the existing official OAuth redirect for explicit login actions.
// One Tap initialization belongs only to the page, not to each UI button.
export function redirectGoogleLogin(): void {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.warn("[Auth] NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.");
    return;
  }
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: window.location.origin,
    response_type: "token id_token",
    scope: "openid email profile",
    nonce: String(Date.now()),
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}
