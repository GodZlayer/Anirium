import assert from "node:assert/strict";
import test from "node:test";
import { parseAniListResponse, assertDiscoveryAvailable } from "./anilist-response.mjs";

test("upstream failures cannot masquerade as an empty successful catalog", () => {
  for (const [status, body] of [
    [429, '{}'], [500, '{}'], [200, '{"errors":[{"message":"rate limit"}]}'],
    [200, '{}'], [200, '{"data":{"Page":{"media":[]}}}'], [200, '<html>challenge</html>'],
  ]) assert.throws(() => parseAniListResponse(status, body));
});

test("an explicit empty final page is a valid end of pagination", () => {
  const body = '{"data":{"Page":{"media":[],"pageInfo":{"hasNextPage":false}}}}';
  assert.deepEqual(parseAniListResponse(200, body).data.Page.media, []);
});

test("publication is rejected when all discovery sources returned no data", () => {
  assert.throws(() => assertDiscoveryAvailable([], [], [], []), /snapshot preserved/);
  assert.doesNotThrow(() => assertDiscoveryAvailable([], [{ idMal: 269 }], []));
});
