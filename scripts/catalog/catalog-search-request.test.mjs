import test from "node:test";
import assert from "node:assert/strict";
import { requestCatalogSearch } from "../../resources/js/lib/catalogSearchRequest.mjs";

test("search returns validated data and distinguishes maintenance from malformed responses", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async () => Response.json({ items: [], total: 0, pages: 0 });
    assert.equal((await requestCatalogSearch("q=empty", controller.signal)).total, 0);
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(requestCatalogSearch("", controller.signal), /^Error: unavailable$/);
    globalThis.fetch = async () => Response.json({ items: [], total: -1, pages: 0 });
    await assert.rejects(requestCatalogSearch("", controller.signal), /^Error: error$/);
  } finally { globalThis.fetch = original; }
});

test("search timeout and replacement cancellation abort the actual fetch", async () => {
  const original = globalThis.fetch;
  const keepAlive = setInterval(() => {}, 1000);
  try {
    globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    await assert.rejects(requestCatalogSearch("", new AbortController().signal, 10), { name: "TimeoutError" });
    const controller = new AbortController();
    const pending = requestCatalogSearch("", controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  } finally { clearInterval(keepAlive); globalThis.fetch = original; }
});

test("a response replaced while decoding cannot publish stale results", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => {
      controller.abort();
      return { items: [], total: 0, pages: 0 };
    } });
    await assert.rejects(requestCatalogSearch("", controller.signal), { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});
