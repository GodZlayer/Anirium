import test from "node:test";
import assert from "node:assert/strict";
import { readWorkGraph, graphActionTarget, graphCanonicalArcs, contextEpisodeNumbers, requestWorkGraph } from "../../resources/js/lib/catalogEntityGraph.mjs";

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
function fixture() {
  return { schema: 1, entity: { id: id(1), kind: "work", episode_count: 24 }, universe_ids: [id(2)],
    seasons: [{ id: id(3), work_id: id(1), number: 2 }],
    episodes: [{ id: id(4), work_id: id(1), season_id: id(3), number: 9, numbering_scheme: "original" }],
    arcs: [{ id: id(5), universe_id: id(2), aliases: [`work:${id(1)}:source-arc:original`], episode_ids: [id(4)] }], relations: [] };
}

test("actions use permanent IDs after renumbering and independently of arc positions", () => {
  const graph = readWorkGraph(fixture(), id(1));
  assert.equal(graphActionTarget(graph, "work"), id(1));
  assert.equal(graphActionTarget(graph, "universe"), id(2));
  assert.equal(graphActionTarget(graph, "episode", { episode: 9 }), id(4));
  graph.episodes[0].number = 49;
  assert.equal(graphActionTarget(graph, "episode", { episode: 49 }), id(4));
  assert.equal(graphActionTarget(graph, "episode", { episode: 9 }), null);
  graph.arcs.unshift({ id: id(6), universe_id: id(2), aliases: [], episode_ids: [] });
  assert.equal(graphActionTarget(readWorkGraph(graph, id(1)), "arc", { arc: "original" }), id(5));
  assert.equal(graphActionTarget(graph, "season", { season: 2 }), id(3));
  assert.equal(graphActionTarget(graph, "season", { arcIndex: 1 }), null);
});

test("unproven episodes and ambiguous universes never acquire invented IDs", () => {
  const graph = fixture();
  graph.episodes = []; graph.arcs = []; graph.seasons = []; graph.universe_ids.push(id(7));
  readWorkGraph(graph, id(1));
  assert.equal(graphActionTarget(graph, "episode", { episode: 24 }), null);
  assert.equal(graphActionTarget(graph, "universe"), null);
  assert.equal(graphActionTarget(graph, "arc", { arc: "missing" }), null);
});

test("season and arc episode lists use explicit IDs rather than filling their source intervals", () => {
  const graph = fixture();
  graph.arcs[0] = { ...graph.arcs[0], title: "Source arc", start_number: 1, end_number: 24, classification: "unknown" };
  readWorkGraph(graph, id(1));
  assert.deepEqual(contextEpisodeNumbers(graph, "arc", id(5)), [9]);
  assert.deepEqual(contextEpisodeNumbers(graph, "season", id(3)), [9]);
  assert.deepEqual(contextEpisodeNumbers(graph, "arc", id(8)), []);
  const arcs = graphCanonicalArcs(graph);
  assert.equal(arcs[0].arcId, id(5));
  assert.equal(graphActionTarget(graph, "arc", { arc: arcs[0].arcId }), id(5));
  graph.arcs[0].episode_ids = []; graph.episodes = [];
  assert.deepEqual(contextEpisodeNumbers(graph, "arc", id(5)), []);
  assert.equal(graphCanonicalArcs(graph)[0].episodesCount, 24);
});

test("foreign membership, duplicate identities and responses for another work are rejected", async () => {
  const foreign = fixture(); foreign.episodes[0].work_id = id(7);
  assert.throws(() => readWorkGraph(foreign, id(1)), /membership/);
  const duplicate = fixture(); duplicate.episodes[0].id = id(3);
  assert.throws(() => readWorkGraph(duplicate, id(1)), /Duplicate/);
  const wrongSeason = fixture(); wrongSeason.episodes[0].season_id = id(8);
  assert.throws(() => readWorkGraph(wrongSeason, id(1)), /membership/);
  const signal = new AbortController().signal;
  await assert.rejects(requestWorkGraph(id(7), signal, async (url, options) => {
    assert.equal(url, `/api/catalog/graph/work/${id(7)}`);
    assert.equal(options.signal, signal);
    return { ok: true, json: async () => fixture() };
  }), /Invalid work graph/);
});
