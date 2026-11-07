import { catalogFetch } from "./catalogTransport.mjs";

export async function requestCatalogSearch(parameters, signal, timeout = 25000) {
  const response = await catalogFetch(`/api/catalog/search?${parameters}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
  });
  if (!response.ok) throw new Error(response.status === 503 ? "unavailable" : "error");
  const data = await response.json();
  signal.throwIfAborted();
  if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.pages) || data.pages < 0) throw new Error("error");
  return data;
}
