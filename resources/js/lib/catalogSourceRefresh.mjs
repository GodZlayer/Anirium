export async function refreshCatalogSources({ refreshUnified, legacyRevision, loadLegacy, request = fetch, signal, allowLegacy = true }) {
  signal?.throwIfAborted();
  let unifiedError = null;
  try { await refreshUnified({ signal }); } catch (error) { unifiedError = error; }
  if (!allowLegacy || !legacyRevision()) {
    if (unifiedError) throw unifiedError;
    return { legacy: "not-loaded" };
  }
  const response = await request("/data/catalog.parquet.status.json", { cache: "no-cache", signal });
  if (!response.ok) return { legacy: "unavailable" };
  const status = await response.json();
  if (!/^[a-f0-9]{64}$/.test(status.snapshotSha256)) throw new Error("Invalid legacy catalog status");
  if (status.snapshotSha256 === legacyRevision()) return { legacy: "unchanged" };
  signal?.throwIfAborted();
  await loadLegacy(true);
  return { legacy: legacyRevision() === status.snapshotSha256 ? "updated" : "retained" };
}
