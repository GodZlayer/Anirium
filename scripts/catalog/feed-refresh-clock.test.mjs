import test from "node:test";
import assert from "node:assert/strict";
import { feedRefreshDelay } from "../../resources/js/lib/feedRefreshClock.mjs";
import { readCatalogRelease, validateHomeReleases } from "../../resources/js/lib/catalogRelease.mjs";

test("home refreshes on the next release boundary and keeps a bounded resync when none is known",()=>{
  const now=Date.parse("2026-10-25T12:00:00Z");
  assert.equal(feedRefreshDelay("2026-10-25T12:00:01Z",now),1025);
  assert.equal(feedRefreshDelay("2026-10-25T13:00:00Z",now),30000);
  assert.equal(feedRefreshDelay(null,now),30000);
  assert.equal(feedRefreshDelay("invalid",now),30000);
});

test("a release carries its own episode UUID and the exact related work UUID",()=>{
  const work="00000000-0000-4000-8000-000000000001",episode="00000000-0000-4000-8000-000000000002";
  const release={id:episode,work_id:work,number:3,air_date_utc:"2026-10-25T12:00:00Z"};
  assert.deepEqual(readCatalogRelease(release,work),release);
  assert.throws(()=>readCatalogRelease({...release,work_id:episode},work),/Invalid/);
  assert.throws(()=>readCatalogRelease({...release,id:"mal:123:ep-3"},work),/Invalid/);
  assert.throws(()=>readCatalogRelease({...release,air_date_utc:"2026-10-25"},work),/Invalid/);
  assert.equal(readCatalogRelease(undefined,work),undefined);
  assert.throws(()=>validateHomeReleases([{work_id:work}]),/Home requires/);
  assert.throws(()=>validateHomeReleases([{release},{release}]),/Home requires/);
  assert.equal(validateHomeReleases([{release},{release:{...release,id:work}}]).length,2);
});
