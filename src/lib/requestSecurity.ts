const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_API_BODY_BYTES = 64 * 1024;

// This guards browser request provenance, not user identity. Routes still own
// authorization. Never derive the production trust origin from forwarded Host.
export function checkApiRequest(request: Request, production: boolean,
  publicOrigin = "https://anirium.com.br"): { status: number; reason: string } | null {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_API_BODY_BYTES)) {
    return { status: 413, reason: "request_body_too_large" };
  }
  if (!mutationMethods.has(request.method)) return null;
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return { status: 403, reason: "cross_site_request" };
  }
  const origin = request.headers.get("origin");
  if (origin) {
    let expected: string;
    try { expected = new URL(production ? publicOrigin : request.url).origin; }
    catch { return { status: 503, reason: "invalid_public_origin" }; }
    if (origin !== expected) return { status: 403, reason: "untrusted_origin" };
  }
  // JSON cannot be submitted through a cross-origin HTML form. Requests without
  // Origin remain usable by native clients, with normal route authorization.
  if (request.method !== "DELETE" || length !== null && length !== "0") {
    const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (type !== "application/json") return { status: 415, reason: "json_required" };
  }
  return null;
}
