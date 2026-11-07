import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAniZip } from "./anizip-record.mjs";
import { readEpisodeMetadata, episodeTitle, episodeReleaseState, episodeNumbersFor, adjacentEpisode } from "../../resources/js/lib/episodeMetadata.mjs";

const now = "2026-10-21T00:00:00Z";
const work = { mal_id: 38524, episodes: 10 };
const data = { mappings: { mal_id: 38524 }, episodeCount: 999, episodes: {
  "1": { episode: "1", episodeNumber: 13, absoluteEpisodeNumber: 50, title: { en: "First local episode", ja: "日本語" }, airDateUtc: "2020-01-01T12:00:00Z" },
  S1: { episode: "S1", episodeNumber: 1, title: { en: "Special" } },
} };

test("MAL-local episode identity survives TVDB offsets and specials remain separate", () => {
  const result = normalizeAniZip(data, work, now);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].number, 1);
  assert.equal(result.specials[0].key, "S1");
  assert.equal(readEpisodeMetadata(result, work), result);
  assert.equal(episodeTitle(result.episodes[0], "pt-BR", "Fallback"), "First local episode");
  assert.equal(episodeTitle({ titles: { "pt-BR": "Nome em português" } }, "pt-BR", "Fallback"), "Nome em português");
});

test("cross-work mappings, manga and inconsistent local episode identities are rejected", () => {
  assert.throws(() => normalizeAniZip(data, { mal_id: 20 }, now), /mapping mismatch/);
  assert.throws(() => normalizeAniZip(data, { ...work, entity_type: "MANGA" }, now), /mapping mismatch/);
  assert.throws(() => normalizeAniZip({ ...data, episodes: { "1": { episode: "2" } } }, work, now), /episode identity/);
});

test("out-of-range metadata cannot increase a canonical MAL episode total", () => {
  const result = normalizeAniZip({ ...data, episodes: { ...data.episodes, "11": { episode: "11", title: { en: "Outside the work" } } } }, work, now);
  assert.deepEqual(result.rejected_numbers, ["11"]);
  assert.equal(result.mal_episode_count, 10);
  assert.equal(result.episodes.length, 1);
});

test("only explicit timestamps can establish release and malformed dates stay unknown", () => {
  const malformed = normalizeAniZip({ ...data, episodes: { "1": { episode: "1", airDate: "2026-02-30" } } }, work, now);
  assert.equal(malformed.episodes[0].air_date, null);
  assert.equal(episodeReleaseState({ air_date_utc: "2026-10-22T00:00:00Z" }, Date.parse(now)), "upcoming");
  assert.equal(episodeReleaseState({ air_date_utc: "2026-10-20T00:00:00Z" }, Date.parse(now)), "released");
  for (const date of ["2026-10-20", "2026-10-20T00:00:00", "2026-02-30T00:00:00Z", "invalid"]) assert.equal(episodeReleaseState({ air_date_utc: date }, Date.parse(now)), "unknown");
});

test("unknown totals use observed local episodes without inventing missing numbers or totals", () => {
  const unknown = { mal_id: 38524, latest_episode_num: 99 };
  assert.deepEqual(episodeNumbersFor(unknown, null), []);
  const document = normalizeAniZip({ ...data, episodes: { "1": data.episodes["1"], "3": { episode: "3" } } }, unknown, now);
  const numbers = episodeNumbersFor(unknown, document);
  assert.deepEqual(numbers, [1, 3]);
  assert.equal(adjacentEpisode(numbers, 1, 1), 3);
  assert.equal(adjacentEpisode(numbers, 3, -1), 1);
  assert.equal(adjacentEpisode(numbers, 3, 1), 3);
});

test("a total alone never manufactures an episode index and sparse documents keep their gaps", () => {
  assert.deepEqual(episodeNumbersFor(work, null), []);
  const document = normalizeAniZip({ ...data, episodes: { "1": data.episodes["1"], "3": { episode: "3" } } }, work, now);
  assert.deepEqual(episodeNumbersFor(work, document), [1, 3]);
  assert.deepEqual(episodeNumbersFor({ ...work, entity_type: "NOVEL" }, document), []);
});

test("documented classification supplies only explicitly known numbers within the work", () => {
  const evidence = { mal_id: work.mal_id, source: "animefillerlist", source_url: "https://www.animefillerlist.com/shows/example", checked_at: now,
    canon: ["1-2", "9-12", "5", "invalid", "1-999999999"], filler: ["5", "7"], mixed: [] };
  const classified = { ...work, filler_episodes_json: JSON.stringify(evidence) };
  assert.deepEqual(episodeNumbersFor(classified, null), [1, 2, 7, 9, 10]);
  assert.deepEqual(episodeNumbersFor({ ...classified, mal_id: 20 }, null), []);
});
