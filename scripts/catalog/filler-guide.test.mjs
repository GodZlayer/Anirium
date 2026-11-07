import assert from "node:assert/strict";
import test from "node:test";
import { parseFillerGuide } from "./filler-guide.mjs";

test("the guide preserves all classifications and never borrows a neighboring group's episodes", () => {
  const html = '<div class="manga_canon"><span class="Episodes"><a>1-7</a>, <a>9</a></span></div>'
    + '<div class="mixed_canon/filler"><span class="Episodes">8</span></div>'
    + '<div class="filler"><span class="Label">No reported episodes</span></div>'
    + '<div class="anime_canon"><span class="Episodes">10</span></div>';
  assert.deepEqual(parseFillerGuide(html), { filler: [], mixed: ["8"], manga_canon: ["1-7", "9"], anime_canon: ["10"] });
});
