import test from "node:test";
import assert from "node:assert/strict";
import { importRecipe } from "./import-recipe.mjs";
test("reporting, scheduling and search changes do not require reimporting unchanged source snapshots", () => {
  const inputs = [];
  const first = importRecipe({ read: file => { inputs.push(file); return "same normalization"; } });
  const second = importRecipe({ read: () => "same normalization" });
  assert.equal(first, second);
  assert.equal(inputs.includes("scripts/catalog/catalog-runtime-status.mjs"), false);
  assert.equal(inputs.includes("scripts/catalog/search-index.mjs"), false);
  assert.ok(inputs.includes("resources/js/lib/catalogIdentity.mjs"));
  assert.notEqual(first, importRecipe({ read: file => file.endsWith("mangabaka-record.mjs") ? "corrected input schema" : "same normalization" }));
});
test("missing normalization code cannot silently reuse an old import", () => {
  assert.throws(() => importRecipe({ read: () => { throw Error("missing module"); } }), /missing module/);
});
