import test from "node:test";
import assert from "node:assert/strict";
import { getLocalizedSynopsis } from "../../resources/js/lib/designStrings.ts";

test("untranslated works retain their actual synopsis in every supported interface language", () => {
  const work = { title: "Unmapped synopsis regression fixture", synopsis: "Original provider synopsis" };
  for (const language of ["pt-BR", "en-US", "ja-JP", "es-ES", "fr-FR", "de-DE"]) {
    assert.equal(getLocalizedSynopsis(work, language), work.synopsis);
    assert.equal(getLocalizedSynopsis({ ...work, synopses: { [language]: "Explicit translation" } }, language), "Explicit translation");
  }
});

test("missing synopsis is reported as unavailable without claims about canon or streaming", () => {
  const work = { title: "Unmapped synopsis regression fixture" };
  assert.equal(getLocalizedSynopsis(work, "pt-BR"), "Sinopse indisponível.");
  assert.equal(getLocalizedSynopsis(work, "en-US"), "Synopsis unavailable.");
  assert.equal(getLocalizedSynopsis(null, "pt-BR"), "");
});
