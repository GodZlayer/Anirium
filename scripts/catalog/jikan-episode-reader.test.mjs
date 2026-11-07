import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJikanEpisodes } from "./jikan-episode-reader.mjs";
import { readEpisodeMetadata } from "../../resources/js/lib/episodeMetadata.mjs";
import { normalizeJikanEpisodes } from "./jikan-episode-record.mjs";

export const episode = number => ({ mal_id: number, title: `Title ${number}`, title_japanese: null, title_romanji: null,
  aired: "2020-01-01T00:00:00+00:00", filler: false, recap: false });
export const page = (number, next, records) => ({ pagination: { current_page: number, has_next_page: next }, data: records });
const temporary = t => { const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-jikan-reader-")); t.after(() => fs.rmSync(directory, { recursive: true })); return directory; };

test("episode pagination resumes from the first missing page and retains observation times", async t => {
  const directory = temporary(t), work = { mal_id: 11757, episodes: 3 };
  let clock = Date.parse("2026-10-22T00:00:00Z");
  await assert.rejects(readJikanEpisodes(work, async url => {
    if (new URL(url).searchParams.get("page") === "1") return page(1, true, [episode(1)]);
    throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
  }, { directory, now: () => clock }), /timeout/);
  clock += 60000;
  const calls = [];
  const result = await readJikanEpisodes(work, async url => { calls.push(url); return page(2, false, [episode(3)]); }, { directory, now: () => clock });
  assert.deepEqual(calls, ["https://api.jikan.moe/v4/anime/11757/episodes?page=2"]);
  assert.deepEqual(result.document.episodes.map(item => item.number), [1, 3]);
  assert.equal(result.document.episodes[0].checked_at, "2026-10-22T00:00:00.000Z");
  assert.equal(result.document.episodes[1].checked_at, "2026-10-22T00:01:00.000Z");
  assert.equal(result.document.checked_at, "2026-10-22T00:00:00.000Z");
  assert.equal(result.document.episodes[0].air_date_utc, null);
  assert.equal(result.document.episodes[0].air_date, "2020-01-01");
  assert.equal(result.document.episodes[0].source_flags.filler, false);
  assert.equal(Object.hasOwn(result.document.episodes[0], "classification"), false);
  assert.ok(readEpisodeMetadata(result.document, work));
  assert.equal(readEpisodeMetadata({ ...result.document, source_url: "https://evil.example/episodes" }, work), null);
  result.complete();
  assert.ok(JSON.parse(fs.readFileSync(path.join(directory, "11757/checkpoint.json"))).completedAt);
});

test("ambiguous numbering, repeated pages and absent continuation evidence are rejected", async t => {
  for (const [index, payloads] of [
    [page(1, true, [episode(1)]), page(2, false, [episode(1)])],
    [page(1, true, [])], [page(1, false, [episode(4)])],
    [{ data: [episode(1)], pagination: {} }], [page(2, false, [episode(1)])],
  ].entries()) {
    const directory = path.join(temporary(t), String(index)); let calls = 0;
    await assert.rejects(readJikanEpisodes({ mal_id: 1, episodes: 3 }, async () => payloads[calls++], { directory }));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, "1/checkpoint.json"))).completedAt, undefined);
  }
  assert.throws(() => normalizeJikanEpisodes([episode(1)], { mal_id: 1, entity_type: "MANGA" }, "2026-10-22"));
});

test("corrupted page caches are refetched and changed totals invalidate a partial generation", async t => {
  const directory = temporary(t), work = { mal_id: 1, episodes: 2 };
  await assert.rejects(readJikanEpisodes(work, async url => {
    if (new URL(url).searchParams.get("page") === "1") return page(1, true, [episode(1)]);
    throw new Error("stopped");
  }, { directory }));
  fs.writeFileSync(path.join(directory, "1/pages/1.json"), "broken");
  let requests = 0;
  await readJikanEpisodes(work, async () => { requests++; return page(1, false, [episode(1)]); }, { directory });
  assert.equal(requests, 1);
  work.episodes = 3;
  await readJikanEpisodes(work, async () => { requests++; return page(1, false, [episode(1)]); }, { directory });
  assert.equal(requests, 2);
});
