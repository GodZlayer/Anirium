import { attachFieldEvidence } from "./field-provenance.mjs";

export function applyMalSourceHealth(rows, health) {
  const states = new Map(health.map(entry => [`${entry.media}:${entry.id}`, entry]));
  const report = { unavailable: 0, quarantined: 0, restored: 0 };
  for (const row of rows) {
    const media = row.entity_type === "WORK" ? "anime" : "manga", status = states.get(`${media}:${row.mal_id}`);
    if (!status) continue;
    const failedAfterCache = status.failure && Date.parse(status.failure.attemptedAt) > Date.parse(status.checkedAt || "1970-01-01");
    const available = Boolean(status.checkedAt) && !failedAfterCache;
    row.provider_health_json = JSON.stringify({ mal: { media, id: row.mal_id, state: available ? "available" : status.failure ? "unavailable" : "unknown",
      checked_at: available ? status.checkedAt : status.failure?.attemptedAt || null, status: available ? 200 : status.failure?.status || null } });
    const references = JSON.parse(row.external_ids_json || "[]");
    const unsupported = !status.checkedAt && status.failure?.status === 404 && !row.metadata_source
      && references.every(reference => reference.provider === "mal");
    if (unsupported) { row.catalog_visibility = "quarantined"; row.catalog_visibility_reason = "unverified-legacy-mal-reference"; report.quarantined++; }
    else if (row.catalog_visibility_reason === "unverified-legacy-mal-reference") {
      if (status.checkedAt || references.some(reference => reference.provider !== "mal")) {
        row.catalog_visibility = "visible"; row.catalog_visibility_reason = "verified-source-arrived"; report.restored++;
      }
    }
    if (!available && status.failure) report.unavailable++;
    attachFieldEvidence(row, ["provider_health_json", "catalog_visibility", "catalog_visibility_reason"], { provider: "myanimelist", source_url: `https://myanimelist.net/${media}/${row.mal_id}`,
      observed_at: available ? status.checkedAt : status.failure?.attemptedAt || null, imported_at: new Date().toISOString(), domain: "provider-health" });
  }
  return report;
}
