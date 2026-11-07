import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { supplementCatalog } from "./supplemental-stage.mjs";
import { normalizeAniZip } from "./anizip-record.mjs";
import { writeJson } from "./mal-detail-cache.mjs";

test("an empty bootstrap source directory cannot consume an existing global provider cache", async t => {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, "anirium-bootstrap-isolation-"));
  const previous = process.cwd();
  t.after(() => { process.chdir(previous); assert.equal(path.dirname(fs.realpathSync(root)), parent); fs.rmSync(root, { recursive: true }); });
  process.chdir(root);
  const work = { entity_type: "WORK", mal_id: 1, episodes: 1, title: "Bootstrap work" }, now = new Date().toISOString();
  const payload = normalizeAniZip({ mappings: { mal_id: 1 }, episodes: { "1": { episode: "1", title: { en: "Prior cached episode" } } } }, work, now);
  writeJson(path.join(root, "storage/app/catalog/anizip/cache/1.json"), { checkedAt: now, payload });
  const calls = [];
  const result = await supplementCatalog([work], { dataDirectory: path.join(root, "candidate/data"), sourceDirectory: path.join(root, "candidate/sources"), episodeBudget: 0, arcBudget: 0,
    request: async url => { calls.push(String(url)); throw new Error("Provider unavailable in isolation test"); } });
  assert.equal(result.episodes.fresh, 0);
  assert.equal(result.episodes.missing, 1);
  assert.equal(result.episodes.publishedWorks, 0);
  assert.equal(work.episodes_metadata_url, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].includes("/releases/tags/fillers"), true);
});

test("the automatic supplemental stage falls back to Jikan when AniZip has no document", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-jikan-stage-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const work = { entity_type: "WORK", mal_id: 11757, episodes: 25, status: "RELEASING" };
  const result = await supplementCatalog([work], { dataDirectory: path.join(root, "data"), sourceDirectory: path.join(root, "sources"), episodeBudget: 1, arcBudget: 0,
    request: async target => {
      const url = new URL(target);
      if (url.origin !== "https://api.jikan.moe") return new Response(null, { status: 404 });
      return Response.json({ pagination: { has_next_page: false, current_page: 1 }, data: [{ mal_id: 1, title: "Observed episode", aired: null, filler: false, recap: false }] });
    } });
  assert.equal(result.episodes.publishedWorks, 0);
  assert.equal(result.jikanEpisodes.publishedWorks, 1);
  assert.equal(result.assets.indexedEpisodes, 1);
  assert.equal(work.episodes_indexed_count, 1);
});

test("the automatic stage composes AniZip and Jikan gaps without inventing missing episode numbers", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anirium-composition-stage-"));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const work = { entity_type: "WORK", mal_id: 11757, episodes: 4, status: "RELEASING" };
  const result = await supplementCatalog([work], { dataDirectory: path.join(root, "data"), sourceDirectory: path.join(root, "sources"), episodeBudget: 1, arcBudget: 0,
    request: async target => {
      const url = new URL(target);
      if (url.origin === "https://api.ani.zip") return Response.json({ mappings: { mal_id: 11757 }, episodes: { "1": { title: { en: "Primary" } }, "4": { title: { en: "Four" } } } });
      if (url.origin === "https://api.jikan.moe") return Response.json({ pagination: { has_next_page: false }, data: [
        { mal_id: 1, title: "Secondary", title_japanese: "Japanese", aired: null, filler: false, recap: false },
        { mal_id: 3, title: "Three", aired: null, filler: true, recap: false },
      ] });
      return new Response(null, { status: 404 });
    } });
  assert.equal(result.assets.indexedEpisodes, 3);
  assert.equal(result.jikanEpisodes.composedWorks, 1);
  assert.equal(result.jikanEpisodes.episodeConflicts, 1);
  const document = JSON.parse(fs.readFileSync(path.join(root, "data", work.episodes_metadata_url.slice(6))));
  assert.deepEqual(document.episodes.map(item => item.number), [1, 3, 4]);
  assert.equal(document.episodes[0].titles.en, "Primary"); assert.equal(document.episodes[0].titles.ja, "Japanese");
});
