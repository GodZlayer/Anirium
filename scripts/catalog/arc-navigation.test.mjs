import test from "node:test";
import assert from "node:assert/strict";
import { selectArcNavigation } from "../../resources/js/lib/arcNavigation.mjs";

const arcs = [{ name: "Phantom Bullet", startEp: 1, endEp: 14 }, { name: "Calibur", startEp: 15, endEp: 17 }, { name: "Mother's Rosario", startEp: 18, endEp: 24 }];
test("episode navigation derives the breadcrumb and checkpoint index from the sourced interval", () => {
  const selected = selectArcNavigation(arcs, "episode", 16, 0);
  assert.equal(selected.index, 1);
  assert.equal(selected.activeArc.name, "Calibur");
  assert.equal(selected.currentEpisodeArc.episodeInArc, 2);
  const next = selectArcNavigation(arcs, "episode", 18, 1);
  assert.equal(next.index, 2);
  assert.equal(next.activeArc.name, "Mother's Rosario");
  assert.equal(selectArcNavigation(arcs, "arc", 1, 1).activeArc.name, "Calibur");
});
test("missing intervals never assign an episode to the first arc", () => {
  assert.equal(selectArcNavigation(arcs, "episode", 25, 0).activeArc, null);
  assert.equal(selectArcNavigation([], "episode", 1, 0).currentEpisodeArc, null);
  assert.equal(selectArcNavigation([{ name: "Later", startEp: 5, endEp: 7 }], "episode", 3, 0).index, -1);
});

test("an explicit arc reference survives reordering and seasons never become arcs", () => {
  const identified = arcs.map((arc, index) => ({ ...arc, arcId: `source-${index}` }));
  assert.equal(selectArcNavigation(identified, "arc", 1, 0, "source-2").activeArc.name, "Mother's Rosario");
  assert.equal(selectArcNavigation([...identified].reverse(), "arc", 1, 2, "source-2").index, 0);
  assert.equal(selectArcNavigation(identified, "arc", 1, 0, "missing").activeArc, null);
  assert.equal(selectArcNavigation(identified, "season", 16, 1).activeArc, null);
});
