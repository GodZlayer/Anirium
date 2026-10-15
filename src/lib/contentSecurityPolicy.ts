// Scripts use a per-response nonce; styles retain inline declarations required
// by React/Framer Motion. This style permission never authorizes inline scripts.
export function contentSecurityPolicy(nonce: string, development = false) {
  if (!/^[A-Za-z0-9+/]{32}={0,2}$/.test(nonce)) throw new Error("Invalid CSP nonce");
  const loopback = "http://127.0.0.1:4004 http://localhost:4004 http://[::1]:4004";
  // Media may stream from any loopback port (e.g. direct HTTP fixtures on
  // arbitrary local ports); connect-src keeps the fixed Service port above.
  const loopbackMedia = "http://127.0.0.1:* http://localhost:* http://[::1]:*";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://accounts.google.com/gsi/client${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' https: data: blob:",
    // HTTPS manifests/media can be chosen by the user. This is not an egress
    // allowlist; authorization and provider SSRF protection live in the Service.
    `connect-src 'self' https: ${loopback}${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    `media-src 'self' https: blob: ${loopbackMedia}`,
    "worker-src 'self' blob:",
    "frame-src https://accounts.google.com/gsi/ https://www.youtube-nocookie.com",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
}
