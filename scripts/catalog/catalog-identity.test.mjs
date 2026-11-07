import test from "node:test";
import assert from "node:assert/strict";
import { catalogIdentity, findCatalogWork, workReference } from "../../resources/js/lib/catalogIdentity.mjs";
import { universeWorksFor } from "../../resources/js/lib/universeMembership.mjs";
import { catalogMetadata, statusLabelKey } from "../../resources/js/lib/catalogMetadata.mjs";

test("unknown and upcoming metadata cannot manufacture released episodes", () => {
  assert.equal(catalogMetadata({ episodes: 12, status: "NOT_YET_RELEASED" }, { entity_type: "WORK" }).latest_episode_num, undefined);
  assert.equal(catalogMetadata({ episodes: 12, status: "COMPLETED" }, { entity_type: "WORK" }).latest_episode_num, 12);
  assert.equal(catalogMetadata({ episodes: 12, latest_episode_num: 4, status: "RELEASING" }, { entity_type: "WORK" }).latest_episode_num, 4);
  assert.equal(catalogMetadata({ episodes: 12, latest_episode_num: 999, status: "RELEASING" }, { entity_type: "WORK" }).latest_episode_num, undefined);
  const unknown = catalogMetadata({ episodes: -1 }, { entity_type: "WORK" });
  assert.equal(unknown.episodes_count, undefined);
  assert.equal(unknown.format, "UNKNOWN");
  assert.equal(unknown.status, "UNKNOWN");
  assert.equal(statusLabelKey(unknown.status), null);
  assert.equal(statusLabelKey("NOT_YET_RELEASED"), "upcoming");
  const manga = catalogMetadata({ episodes: 52, latest_episode_num: 52, status: "COMPLETED" }, { entity_type: "MANGA" });
  assert.equal(manga.episodes_count, undefined);
  assert.equal(manga.latest_episode_num, undefined);
});

test("navigation distinguishes manga from anime while preserving old anime references", () => {
  const anime = { ...catalogIdentity({ mal_id: 1 }), title: "Anime" };
  const manga = { ...catalogIdentity({ mal_id: 1, entity_type: "MANGA" }), title: "Manga" };
  assert.notEqual(anime.id, manga.id);
  assert.equal(manga.mal_id, 1);
  const catalog = [manga, anime];
  assert.equal(findCatalogWork(catalog, "1"), anime);
  assert.equal(findCatalogWork(catalog, "anime:1"), anime);
  assert.equal(findCatalogWork(catalog, "manga:1"), manga);
  assert.equal(findCatalogWork(catalog, workReference(manga)), manga);
  assert.equal(findCatalogWork([manga], "1"), undefined);
  for (const reference of ["1garbage", "1:ep-1", "0", "-1", "unknown:1", "manga:01"]) assert.equal(findCatalogWork(catalog, reference), undefined);
  assert.throws(() => catalogIdentity({ mal_id: 1, catalog_key: "manga:1" }), /Conflicting/);
  assert.throws(() => catalogIdentity({ title: "No identity" }), /Invalid/);
});

test("universes use verified membership rather than similar names or ambiguous MAL IDs", () => {
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`, scope={universe_identity_version:1,universe_ids_json:JSON.stringify([id(9)])};
  const anime = { work_id:id(1),mal_id: 1, title: "Saga",...scope, year: 2020 };
  const sequel = { work_id:id(2),mal_id: 2, title: "Different Title",...scope, year: 2025 };
  const unrelated = { work_id:id(3),mal_id: 3, title: "Saga Music", universe_source: "relations", universe_id: "univ-1" };
  const manga = { work_id:id(4),mal_id: 1, entity_type: "MANGA", title: "Saga",...scope };
  assert.deepEqual(universeWorksFor([anime, sequel, unrelated, manga], anime), [anime, sequel]);
  assert.deepEqual(universeWorksFor([anime, sequel, unrelated, manga], unrelated), [unrelated]);
});
