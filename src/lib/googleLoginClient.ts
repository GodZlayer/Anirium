// Reuse the existing official OAuth redirect for explicit login actions.
// If client id is not configured, dispatch event to open the direct member onboarding dialog.
export function redirectGoogleLogin(): void {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("anirium_open_signin"));
    }
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

