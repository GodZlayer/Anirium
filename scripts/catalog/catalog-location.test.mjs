import test from "node:test";
import assert from "node:assert/strict";
import { catalogLandingUrl, catalogPreviewSelected } from "../../resources/js/lib/catalogLocation.mjs";

test("navigation cleanup preserves the selected candidate while discarding unrelated query parameters", () => {
  const url = catalogLandingUrl("?tab=explore&catalog=candidate&candidate=live-refresh-verification&code=discard&token=discard");
  assert.equal(url, "/?catalog=candidate&candidate=live-refresh-verification");
  assert.equal(catalogPreviewSelected(new URL(url, "https://local.example").search), true);
  assert.equal(catalogLandingUrl("?tab=explore&candidate=ignored&code=discard"), "/");
  assert.equal(catalogLandingUrl("?catalog=candidate"), "/?catalog=candidate");
  assert.equal(catalogLandingUrl("?catalog=candidate&candidate="), "/?catalog=candidate&candidate=");
});
