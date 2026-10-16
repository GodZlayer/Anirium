/**
 * Centralized API endpoint resolver for Anirium.
 * Supports static GitHub Pages (pointing to https://api.anirium.com.br)
 * as well as Docker / SSR / local development.
 */

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.includes("anirium.com.br") || host.includes("github.io")) {
      return "https://api.anirium.com.br";
    }
  }
  return "";
}

export const API_BASE_URL: string = getApiBaseUrl();

/**
 * Returns full URL if path begins with '/api', resolving against API_BASE_URL when necessary.
 */
export function resolveApiUrl(path: string): string {
  if (!path.startsWith("/")) return path;
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path}`;
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
