import { SOURCE_CONTRACTS } from "./source-contracts.mjs";

const instant = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const failureKinds = new Set(["timeout", "rate-limited", "access-denied", "service-unavailable", "http-error", "invalid-response", "network-error", "unclassified"]);
const errorSummary = error => error ? { status: Number.isInteger(error.status) && error.status >= 100 && error.status <= 599 ? error.status : null,
  kind: failureKinds.has(error.kind) ? error.kind : "unclassified" } : null;
const recordFailures = value => {
  const errors = Array.isArray(value?.errors) ? value.errors : [];
  return { failedRecords: errors.length, missingReferences: errors.filter(error => error?.status === 404).length };
};
const stats = value => Object.fromEntries(["records", "total", "fresh", "stale", "missing", "pending", "attempted", "updated", "discoveredReferences", "deferredCrossMedia", "publishedWorks", "indexedEpisodes", "composedWorks", "episodeConflicts", "preservedEpisodes", "applied", "newerExisting", "httpRequests", "conflicts", "noSupportedEvidence", "skipped", "outsideDomain", "waitingAtStart", "deferred", "interrupted", "retryWaiting"]
  .filter(key => Number.isSafeInteger(value?.[key]) && value[key] >= 0).map(key => [key, value[key]]));
export function sourceFailureKind(error) {
  if (["AbortError", "TimeoutError"].includes(error?.name) || ["UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "ETIMEDOUT"].includes(error?.cause?.code || error?.code)) return "timeout";
  if (error?.status === 429) return "rate-limited";
  if ([401, 403].includes(error?.status)) return "access-denied";
  if (error?.status === 503) return "service-unavailable";
  if (Number.isInteger(error?.status)) return "http-error";
  if (error instanceof SyntaxError) return "invalid-response";
  if (["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN"].includes(error?.cause?.code || error?.code)) return "network-error";
  return "unclassified";
}

export function sourceReadiness(report = {}, contracts = SOURCE_CONTRACTS) {
  const discovery = report?.discovery || {}, enrichment = report?.enrichment || {}, supplemental = report?.supplemental || {};
  const evidence = {
    "anime-offline-database": [report?.sources?.anime && { ...report.sources.anime, collectionAt: report.availability?.anime?.checkedAt, error: report.availability?.anime?.error }],
    mangabaka: [report?.sources?.publications && { ...report.sources.publications, collectionAt: report.availability?.publications?.checkedAt, error: report.availability?.publications?.error }],
    mal: [discovery.mal, ...Object.values(discovery.releases || {}), ...Object.values(enrichment.report || {}), enrichment.state === "unavailable" ? { unavailable: true } : null],
    jikan: [...Object.values(discovery.seasons || {}), supplemental.jikanEpisodes],
    anizip: [supplemental.episodes],
    animefillerlist: [supplemental.classification && { ...supplemental.classification, ...supplemental.classification.coverage, collectionAt: supplemental.classification.provenance?.checkedAt }],
    mediawiki: [supplemental.mediawiki],
  };
  return Object.fromEntries(Object.entries(contracts).map(([source, contract]) => {
    if (contract.enabled !== true) return [source, { state: contract.enabled === false ? "disabled" : "not-admitted", reason: contract.reason || "Connector contract and admission are pending", documentation: contract.documentation || null,
      technicalContract: contract.technicalContract || null, automatic: false }];
    const observations = (evidence[source] || []).filter(Boolean);
    const failures = observations.filter(value => value.error || value.sourceError || value.unavailable || value.state === "unavailable"
      || recordFailures(value).failedRecords > recordFailures(value).missingReferences);
    const usable = observations.some(value => value.state === "imported" || ["records", "fresh", "stale", "publishedWorks", "newerExisting", "applied"]
      .some(key => Number.isSafeInteger(value[key]) && value[key] > 0));
    const stale = observations.some(value => value.stale === true || (typeof value.stale === "number" && value.stale > 0));
    const dates = observations.map(value => instant(value.checkedAt || value.completedAt || value.collectionAt)).filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a));
    return [source, { automatic: true, state: !observations.length ? "unobserved" : failures.length || stale ? usable ? "data-degraded" : "unavailable" : usable ? "data-available" : "no-data-observed",
      lastCollectionAt: dates[0] || null, remoteReachability: "not-inferred-from-cache", observations: observations.map(value => ({ ...stats(value), ...recordFailures(value),
        staleData: value.stale === true || typeof value.stale === "number" && value.stale > 0, nextRetryAt: instant(value.nextRetryAt),
        error: errorSummary(value.error || value.sourceError) })) }];
  }));
}
