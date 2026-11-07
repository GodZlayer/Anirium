import test from "node:test";
import assert from "node:assert/strict";
import { sourceReadiness, sourceFailureKind } from "./source-readiness.mjs";

test("every configured source is represented and disabled or unadmitted connectors are never reported as automatic", () => {
  const status = sourceReadiness({});
  assert.equal(status.kitsu.state, "disabled");
  assert.equal(status.kitsu.automatic, false);
  assert.equal(status.mediawiki.state, "unobserved");
  assert.equal(status.anilist.state, "disabled");
  assert.equal(status.mal.state, "unobserved");
  assert.equal(sourceReadiness({}, { newSource: {} }).newSource.state, "not-admitted");
});
test("cached data and stale records do not prove remote reachability or become a missing-source success", () => {
  const status = sourceReadiness({ sources: { anime: { state: "imported", records: 10 } },
    discovery: { seasons: { now: { checkedAt: "2026-10-21T00:00:00Z", stale: true, records: 3, error: { status: 503, kind: "service-unavailable" } } } },
    enrichment: { report: { anime: { total: 10, fresh: 5, stale: 2, missing: 3, checkedAt: "2026-10-22T00:00:00Z" } } } });
  assert.equal(status["anime-offline-database"].state, "data-available");
  assert.equal(status.jikan.state, "data-degraded");
  assert.equal(status.mal.state, "data-degraded");
  assert.equal(status.mal.observations[0].stale, 2);
  assert.equal(status.mal.remoteReachability, "not-inferred-from-cache");
  assert.equal(status.anizip.state, "unobserved");
});
test("unavailable sources retain sanitized diagnostics without response bodies, private messages or arbitrary codes", () => {
  const status = sourceReadiness({ discovery: { seasons: { now: { stale: true, error: { status: "private-token", kind: "private-body", message: "private-response" } } } } });
  assert.equal(status.jikan.state, "unavailable");
  assert.deepEqual(status.jikan.observations[0].error, { status: null, kind: "unclassified" });
  assert.equal(JSON.stringify(status).includes("private-"), false);
});
test("timeouts, maintenance-like HTTP failures, invalid JSON and transport errors remain distinct", () => {
  assert.equal(sourceFailureKind({ cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }), "timeout");
  assert.equal(sourceFailureKind({ status: 503 }), "service-unavailable");
  assert.equal(sourceFailureKind({ status: 429 }), "rate-limited");
  assert.equal(sourceFailureKind({ status: 401 }), "access-denied");
  assert.equal(sourceFailureKind(new SyntaxError("private body")), "invalid-response");
  assert.equal(sourceFailureKind({ cause: { code: "ENOTFOUND" } }), "network-error");
});

test("source diagnostics expose pending retry schedules and deferred work without accepting arbitrary values", () => {
  const report = { supplemental: { mediawiki: { waitingAtStart: 2, deferred: 7, retryWaiting: 3,
    nextRetryAt: "2026-10-23T12:00:00Z" } } };
  const observation = sourceReadiness(report).mediawiki.observations[0];
  assert.equal(observation.waitingAtStart, 2);
  assert.equal(observation.deferred, 7);
  assert.equal(observation.retryWaiting, 3);
  assert.equal(observation.nextRetryAt, "2026-10-23T12:00:00Z");
  report.supplemental.mediawiki.nextRetryAt = "private-response";
  report.supplemental.mediawiki.deferred = true;
  const invalid = sourceReadiness(report).mediawiki.observations[0];
  assert.equal(invalid.nextRetryAt, null);
  assert.equal(Object.hasOwn(invalid, "deferred"), false);
});

test("individual collection failures remain visible and degrade cached sources except for missing references", () => {
  const report = { supplemental: { mediawiki: { fresh: 5, errors: [{ id: "private-id", status: 404, message: "private-message" }] } } };
  let status = sourceReadiness(report).mediawiki;
  assert.equal(status.state, "data-available");
  assert.equal(status.observations[0].failedRecords, 1);
  assert.equal(status.observations[0].missingReferences, 1);
  for (const statusCode of [null, 429, 503]) {
    report.supplemental.mediawiki.errors.push({ status: statusCode });
    status = sourceReadiness(report).mediawiki;
    assert.equal(status.state, "data-degraded");
  }
  assert.equal(status.observations[0].failedRecords, 4);
  assert.equal(JSON.stringify(status).includes("private-"), false);
  report.supplemental.mediawiki.fresh = 0;
  assert.equal(sourceReadiness(report).mediawiki.state, "unavailable");
  report.supplemental.mediawiki.errors = { length: 999, private: true };
  assert.equal(sourceReadiness(report).mediawiki.observations[0].failedRecords, 0);
});
