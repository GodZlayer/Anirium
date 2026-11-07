import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { normalizeAniZip } from "./anizip-record.mjs";
import { normalizeJikanEpisodes } from "./jikan-episode-record.mjs";
import { composeEpisodeDocuments } from "./compose-episode-documents.mjs";
import { readEpisodeMetadata, episodeNumbersFor } from "../../resources/js/lib/episodeMetadata.mjs";
import { loadEpisodeMetadata } from "../../resources/js/lib/episodeMetadataLoader.mjs";

const work = { mal_id: 42, entity_type: "WORK", episodes: 4 };
const before = "2026-10-20T00:00:00Z", after = "2026-10-21T00:00:00Z";
const episode = (number, extra = {}) => ({ mal_id: number, title: `Jikan ${number}`, aired: null, filler: false, recap: false, ...extra });
const anizip = (episodes, date = before) => normalizeAniZip({ mappings: { mal_id: 42 }, titles: { "pt-BR": "Titulo" }, episodes }, work, date);
const jikan = (records, date = after) => normalizeJikanEpisodes(records, work, date);

test("explicit episode unions fill fields and retain conflicts with evidence while preserving sparse numbering", () => {
  const primary = anizip({ "1": { title: { en: "AniZip title" }, airDateUtc: "2020-01-01T12:30:00Z" }, "4": { title: { ja: "Four" } } });
  const secondary = jikan([episode(1, { title_japanese: "Japanese", aired: "2020-01-01T00:00:00Z" }), episode(3, { filler: true })]);
  const result = composeEpisodeDocuments(primary, secondary, work);
  assert.deepEqual(episodeNumbersFor(work, result), [1, 3, 4]);
  assert.equal(result.episodes[0].titles.en, "AniZip title");
  assert.equal(result.episodes[0].titles.ja, "Japanese");
  assert.equal(result.episodes[1].source_flags.filler, true);
  assert.equal(Object.hasOwn(result.episodes[1], "classification"), false);
  assert.equal(result.checked_at, "2026-10-20T00:00:00.000Z");
  const titleOrigin = result.evidence[result.episodes[0].field_provenance["titles.ja"]];
  assert.equal(titleOrigin.provider, "jikan"); assert.equal(titleOrigin.upstream, "myanimelist");
  const conflict = result.conflicts.find(item => item.episode === 1 && item.field === "titles.en");
  assert.equal(conflict.selected_value, "AniZip title"); assert.equal(conflict.alternative_value, "Jikan 1");
  assert.equal(result.evidence[conflict.selected_evidence].provider, "anizip");
  assert.equal(result.evidence[conflict.alternative_evidence].provider, "jikan");
  assert.deepEqual(composeEpisodeDocuments(result, secondary, work), result);
  assert.deepEqual(composeEpisodeDocuments(secondary, primary, work), result);
});

test("same-provider refresh updates only observed fields and never drops prior episodes or fresh evidence", () => {
  const previous = anizip({ "1": { title: { en: "Old", ja: "Retained" } }, "4": { title: { en: "Four" } } });
  const current = anizip({ "1": { title: { en: "New" } } }, after);
  const result = composeEpisodeDocuments(previous, current, work);
  assert.deepEqual(result.episodes.map(item => item.number), [1, 4]);
  assert.equal(result.episodes[0].titles.en, "New"); assert.equal(result.episodes[0].titles.ja, "Retained");
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(composeEpisodeDocuments(result, previous, work), result);
  assert.throws(() => composeEpisodeDocuments(previous, anizip({ "1": { title: { en: "Contradiction" } } }), work), /same-observation/);
});

test("two empty source documents remain empty without inventing a derived observation", () => {
  const primary = normalizeAniZip({ mappings: { mal_id: 42 }, episodes: {} }, work, before);
  const secondary = jikan([]);
  assert.deepEqual(composeEpisodeDocuments(primary, secondary, work), secondary);
  assert.deepEqual(composeEpisodeDocuments(secondary, primary, work), secondary);
  assert.deepEqual(episodeNumbersFor(work, composeEpisodeDocuments(primary, secondary, work)), []);
});

test("the site rejects absent, foreign or contradictory provenance in derived documents", () => {
  const result = composeEpisodeDocuments(anizip({ "1": { title: { en: "AniZip" } } }), jikan([episode(1)]), work);
  assert.ok(readEpisodeMetadata(result, work));
  const missing = structuredClone(result); delete missing.episodes[0].field_provenance.number;
  assert.equal(readEpisodeMetadata(missing, work), null);
  const foreign = structuredClone(result); Object.values(foreign.evidence)[0].source_url = "https://example.com";
  assert.equal(readEpisodeMetadata(foreign, work), null);
  const contradiction = structuredClone(result); contradiction.conflicts[0].selected_value = "Forged";
  assert.equal(readEpisodeMetadata(contradiction, work), null);
  assert.equal(readEpisodeMetadata({ ...result, episodes: [null] }, work), null);
  assert.equal(readEpisodeMetadata({ ...result, conflicts: [null] }, work), null);
  assert.equal(readEpisodeMetadata(result, { ...work, entity_type: "MANGA" }), null);
  assert.throws(() => composeEpisodeDocuments(result, { ...result, mal_id: 43 }, work), /input/);
});

test("the production loader accepts a composed immutable document only after checksum and evidence verification", async () => {
  const result = composeEpisodeDocuments(anizip({ "1": { title: { en: "AniZip" } } }), jikan([episode(3)]), work);
  const content = JSON.stringify(result), hash = createHash("sha256").update(content).digest("hex");
  const loaded = await loadEpisodeMetadata({ ...work, episodes_metadata_url: `/data/episodes/anime/42/${hash}.json` }, { request: async () => new Response(content) });
  assert.equal(loaded.source, "anirium"); assert.deepEqual(loaded.episodes.map(item => item.number), [1, 3]);
});
