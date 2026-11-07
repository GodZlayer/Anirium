import test from "node:test";
import assert from "node:assert/strict";
import { malWorkRecord } from "./mal-work-record.mjs";
import { consolidateSnapshot } from "./consolidate-snapshot.mjs";
import { emptyRegistry } from "./work-registry.mjs";
import { mangabakaRecord } from "./mangabaka-record.mjs";

test("direct MAL written metadata preserves unknown chapter totals and distinguishes novels", () => {
  const row = malWorkRecord({ id: 21479, title: "Sword Art Online", media_type: "light_novel", status: "currently_publishing", num_chapters: 0, num_volumes: 0, related_anime: [], related_manga: [] }, "manga", "2026-10-21");
  assert.equal(row.entity_type, "NOVEL"); assert.equal(row.chapters_count, null); assert.equal(row.volumes_count, null);
  assert.equal(row.episodes, undefined); assert.equal(row.status, "RELEASING");
});

test("fresh direct MAL metadata takes priority over an older aggregator without treating its score as MAL", () => {
  const registry = emptyRegistry();
  const snapshot = mangabakaRecord({ id: 1, title: "Aggregate", type: "novel", state: "active", last_updated_at: "2026-10-19", source: { my_anime_list: { id: 21479 } } }, { version: "snapshot", importedAt: "2026-10-21" });
  const before = consolidateSnapshot([], [snapshot], registry).rows;
  const direct = malWorkRecord({ id: 21479, title: "Sword Art Online", media_type: "light_novel", mean: 8.5, related_anime: [], related_manga: [] }, "manga", "2026-10-21");
  const after = consolidateSnapshot(before, [direct], registry).rows[0];
  assert.equal(after.work_id, before[0].work_id); assert.equal(after.title, "Sword Art Online"); assert.equal(after.score, 8.5);
});
