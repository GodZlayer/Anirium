export const ACCOUNT_ADDONS_CHANGED = "anirium:addons-changed";

export async function requestAccountAddons(path = "/api/addons", body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    cache: "no-store",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok || data?.success !== true) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  if (body) window.dispatchEvent(new Event(ACCOUNT_ADDONS_CHANGED));
  return data;
}
