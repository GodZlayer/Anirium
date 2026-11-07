import test from "node:test";
import assert from "node:assert/strict";
import { readDiscussion, postDiscussion, discussionComment } from "../../resources/js/lib/discussionClient.mjs";

const comment = { id: 12, user_name: "Real author", comment_body: "Server content", contains_spoilers: false, created_at: "2026-10-22T00:00:00Z" };
test("an empty discussion stays empty without generated accounts, statements or timestamps", async () => {
  const result = await readDiscussion("work", "work:20", { request: async () => ({ ok: true, json: async () => ({ comments: [] }) }) });
  assert.deepEqual(result, []);
  assert.equal(discussionComment(comment).author, "Real author");
  assert.throws(() => discussionComment({ ...comment, id: "seed-1" }), /Invalid/);
});
test("only a confirmed server record completes a comment submission", async () => {
  const result = await postDiscussion("episode", "episode:20:ep-3", "Text", true, { request: async (url, options) => {
    assert.equal(url, "/api/entity/comments");
    assert.deepEqual(JSON.parse(options.body), { target_type: "episode", target_id: "episode:20:ep-3", comment_body: "Text", contains_spoilers: true });
    return { ok: true, json: async () => ({ comment }) };
  } });
  assert.equal(result.id, "srv_12");
  await assert.rejects(postDiscussion("work", "20", "Text", false, { request: async () => ({ ok: false, status: 503 }) }), /503/);
  await assert.rejects(postDiscussion("work", "20", "Text", false, { request: async () => ({ ok: true, json: async () => ({}) }) }), /Invalid/);
});
test("failed reads do not masquerade as an empty successful discussion", async () => {
  await assert.rejects(readDiscussion("work", "20", { request: async () => ({ ok: false, status: 500 }) }), /500/);
});
