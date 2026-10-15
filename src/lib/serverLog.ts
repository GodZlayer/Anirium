const components = new Set(["user", "postgres", "catalog", "schedule", "sources", "progress", "admin"]);
const codes = new Set(["23505", "23503", "23502", "22P02", "57014", "55P03", "25P03", "08000", "08003", "08006", "53300", "57P01", "28P01", "ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"]);
const operations = new Set(["external-request", "catalog-read", "catalog-write", "catalog-count", "franchise-link", "schedule-read", "schedule-write", "universe-read", "external-cache-read", "external-cache-write", "relation-client-init", "mal-cache-write", "relation-judge"]);

// Never serialize an Error, request, SQL, stack, message or arbitrary properties.
export function logServerFailure(component: string, error: unknown, operation?: string) {
  let code = "unknown";
  try {
    const candidate = (error as any)?.code;
    if (typeof candidate === "string" && codes.has(candidate)) code = candidate;
  } catch { /* Hostile accessors must not mask the original failure. */ }
  console.error(JSON.stringify({ event: "server_operation_failed", component: components.has(component) ? component : "server", code,
    ...(operation && operations.has(operation) ? { operation } : {}) }));
}
