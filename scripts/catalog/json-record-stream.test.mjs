import test from "node:test";
import assert from "node:assert/strict";
import { jsonRecordStream } from "./json-record-stream.mjs";

test("streaming snapshots handle chunk boundaries, quoted braces and literal control characters without losing records", async () => {
  const raw = '{"id":1,"title":"日本語 {x}","text":"a\r\nb"}\n{"id":2,"text":"\\\"quoted\\\""}\r\n';
  const chunks = [raw.slice(0, 3), raw.slice(3, 26), raw.slice(26, 47), raw.slice(47)];
  const records = [];
  for await (const record of jsonRecordStream(chunks)) records.push(record);
  assert.equal(records.length, 2);
  assert.equal(records[0].value.text, "a\r\nb");
  assert.equal(records[0].value.title, "日本語 {x}");
  assert.equal(records[0].normalizedControls, 2);
  assert.equal(records[1].value.text, '"quoted"');
});

test("truncated or structurally malformed data never becomes a successful snapshot", async () => {
  const consume = async chunks => { for await (const _ of jsonRecordStream(chunks)) {} };
  await assert.rejects(consume(['{"id":1']), /Truncated/);
  await assert.rejects(consume(['{"id":}']), /Invalid snapshot JSON/);
  await assert.rejects(consume(['unexpected']), /boundary/);
});
