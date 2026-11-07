import test from "node:test";
import assert from "node:assert/strict";
import { readEntityContext, requestEntityContext, prepareEntityNavigation } from "../../resources/js/lib/catalogEntityContext.mjs";
import { resolveContextWork } from "../../resources/js/lib/contextWorkRefresh.mjs";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = () => ({ schema: 1, entity: { id: id(4), kind: "episode" }, work_id: id(1), selection: { episode_id: id(4), episode_number: 49, season_id: id(3) } });
const catalog = [{ work_id: id(1), entity_type: "WORK", mal_id: 269, title: "First" }, { work_id: id(7), entity_type: "WORK", mal_id: 21, title: "Other" }];
const graph = work => ({ entity: { id: work }, universe_ids: [id(2)], arcs: [], seasons: [], episodes: [{ id: work === id(1) ? id(4) : id(8), work_id: work, number: 49, numbering_scheme: "original" }] });

test("an episode UUID resolves its SQL parent before loading work metadata", async () => {
  const calls = [];
  const result = await resolveContextWork({ kind: "episode", reference: id(4),
    resolveEntity: async (kind, reference) => { calls.push([kind, reference]); return context(); },
    resolve: async work => { calls.push(["work", work]); return catalog[0]; },
    readLegacy: () => { throw Error("No legacy fallback permitted"); } });
  assert.deepEqual(calls, [["episode", id(4)], ["work", id(1)]]);
  assert.equal(result.work.work_id, id(1));
  assert.equal(result.context.selection.episode_number, 49);
});

test("a missing child is definitive and never reinterpreted as a work or ordinal alias", async () => {
  const result = await resolveContextWork({ kind: "arc", reference: id(5), resolveEntity: async () => null,
    resolve: () => { throw Error("Must not load a different parent"); }, readLegacy: () => { throw Error("Must not infer identity"); } });
  assert.equal(result.work, null);
  assert.equal(result.provisional, false);
  assert.equal(await requestEntityContext("arc", id(5), {}, async () => ({ status: 404, ok: false })), null);
});

test("context delivery validates the requested identity, type, parent and numbering", async () => {
  assert.equal(readEntityContext(context(), "episode", id(4), id(1)).work_id, id(1));
  assert.throws(() => readEntityContext(context(), "episode", id(4), id(7)), /Invalid entity/);
  assert.throws(() => readEntityContext(context(), "season", id(4)), /Invalid entity/);
  assert.throws(() => readEntityContext({ ...context(), selection: { episode_id: id(8), episode_number: 49 } }, "episode", id(4)), /selection/);
  await requestEntityContext("episode", id(4), { preferredWork: id(1) }, async url => {
    assert.equal(url, `/api/catalog/context/episode/${id(4)}?work_id=${id(1)}`);
    return { ok: true, json: async () => context() };
  });
});

test("cross-work navigation fetches the destination graph and selects its episode UUID", async () => {
  const target = await prepareEntityNavigation({ graph: graph(id(1)), catalog, kind: "episode", reference: "21", selection: { episode: 49 },
    readGraph: async work => { assert.equal(work, id(7)); return graph(work); } });
  assert.deepEqual(target, { id: id(8), workId: id(7) });
  await assert.rejects(prepareEntityNavigation({ graph: graph(id(1)), catalog, kind: "episode", reference: "269", selection: { episode: 24 } }), /Unknown entity selection/);
  await assert.rejects(prepareEntityNavigation({ graph: graph(id(1)), catalog, kind: "season", reference: "269", selection: { arcIndex: 1 } }), /Unknown entity selection/);
});

test("cancelled destination lookup cannot complete a later navigation", async () => {
  const controller = new AbortController();
  await assert.rejects(prepareEntityNavigation({ graph: graph(id(1)), catalog, kind: "episode", reference: "21", selection: { episode: 49 }, signal: controller.signal,
    readGraph: async work => { controller.abort(); return graph(work); } }), { name: "AbortError" });
});

test("a foreign arc is selected by its explicit source identity rather than a local index", async () => {
  const destination = graph(id(7));
  destination.arcs = [{ id: id(9), aliases: [`work:${id(7)}:source-arc:foreign-arc`] }];
  const target = await prepareEntityNavigation({ graph: graph(id(1)), catalog, kind: "arc", reference: "21", selection: { arc: "foreign-arc", arcIndex: 0 }, readGraph: async () => destination });
  assert.deepEqual(target, { id: id(9), workId: id(7) });
});
