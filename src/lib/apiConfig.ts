/**
 * Centralized API endpoint resolver for Anirium.
 * Supports static GitHub Pages (pointing to https://api.anirium.com.br)
 * as well as Docker / SSR / local development.
 */

export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.hostname === "anirium.com.br"
    ? "https://api.anirium.com.br"
    : "");

/**
 * Returns full URL if path begins with '/api', resolving against API_BASE_URL when necessary.
 */
export function resolveApiUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

/**
 * Global fetch wrapper configured with credentials and CORS support for Anirium API.
 */
export async function aniriumFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url = input;
  if (typeof input === "string") {
    url = resolveApiUrl(input);
  } else if (input instanceof URL) {
    url = input;
  }

  return fetch(url, {
    ...init,
    credentials: "include",
  });
}
