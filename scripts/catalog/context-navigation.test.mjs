import test from "node:test";
import assert from "node:assert/strict";
import { initialLobbyNavigation, readNavigationContext } from "../../resources/js/lib/contextNavigation.ts";
import { loadNavigationStack, pushNavigationStep, popNavigationStep, clearNavigationStack } from "../../resources/js/lib/universalNavigationStack.ts";

test("explicit links and requested tabs take precedence over a saved public context", () => {
  const stack = [{ type: "episode", id: 21881, params: { episode: 16, arcIndex: 1 } }];
  assert.equal(initialLobbyNavigation({ type: "work", id: 20 }, "?tab=explore", stack).context.id, "20");
  for (const tab of ["home", "explore", "calendar"]) assert.deepEqual(initialLobbyNavigation(null, "?tab=" + tab, stack), { tab, context: null });
  const restored = initialLobbyNavigation(null, "", stack);
  assert.equal(restored.context.params.episode, 16);
  assert.equal(restored.context.params.arcIndex, 1);
  assert.equal(restored.tab, "context");
});

test("checkpoint keeps only public navigation parameters and rejects impossible references", () => {
  const result = readNavigationContext({ type: "universe", id: "anime:21881", token: "private-secret", params: { episode: -1, arcIndex: Infinity, viewMode: "invalid", hideFillers: "true", account: "private-account" } });
  assert.deepEqual(result.params, { episode: 1, arcIndex: 0, viewMode: "releases", hideFillers: false });
  assert.equal(JSON.stringify(result).includes("private-"), false);
  for (const bad of [null, [], { type: "admin", id: 20 }, { type: "work", id: "https://example.com" }, { type: "work", id: "9007199254740993" }, { type: "work", id: "anime:9007199254740993" }, { type: "episode", id: 0 }]) assert.equal(readNavigationContext(bad), null);
  assert.deepEqual(initialLobbyNavigation(null, "", { invalid: true }), { tab: "home", context: null });
});

function browserStorage(t) {
  const oldWindow = globalThis.window, oldStorage = globalThis.sessionStorage, data = new Map();
  globalThis.window = { dispatchEvent() {} };
  globalThis.sessionStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  t.after(() => { globalThis.window = oldWindow; globalThis.sessionStorage = oldStorage; });
  return data;
}

test("permanent entity UUIDs survive navigation for every catalog context", t => {
  browserStorage(t);
  const id = "314f8bc9-7335-469c-9e42-4227242db37b";
  for (const type of ["universe", "work", "season", "arc", "episode"]) {
    assert.equal(readNavigationContext({ type, id }).id, id);
    pushNavigationStep({ type, id, label: type, params: { episode: 49 } });
    const restored = initialLobbyNavigation(null, "", loadNavigationStack()).context;
    assert.equal(restored.id, id);
    assert.equal(restored.type, type);
  }
  assert.equal(loadNavigationStack().length, 5);
});

test("the selected work remains a public UUID hint when returning to a universe", t => {
  browserStorage(t);
  const universe = "00000000-0000-4000-8000-000000000001", work = "00000000-0000-4000-8000-000000000002";
  pushNavigationStep({ type: "universe", id: universe, label: "Universe", params: { workId: work } });
  pushNavigationStep({ type: "work", id: work, label: "Work" });
  assert.equal(popNavigationStep().params.workId, work);
  assert.equal(readNavigationContext({ type: "universe", id: universe, params: { workId: "not-an-id" } }).params.workId, undefined);
});

test("episode changes survive storage roundtrip and Back restores the previous episode", t => {
  browserStorage(t);
  const step = episode => ({ type: "episode", id: "work:314f8bc9-7335-469c-9e42-4227242db37b", path: "/ignored?token=private-secret", label: "SAO II", params: { episode, arcIndex: 1, viewMode: "arcs", hideFillers: true } });
  pushNavigationStep(step(15));
  assert.equal(pushNavigationStep(step(16)).length, 2);
  assert.equal(pushNavigationStep(step(16)).length, 2);
  const restored = initialLobbyNavigation(null, "", loadNavigationStack()).context;
  assert.equal(restored.params.episode, 16);
  assert.equal(restored.params.hideFillers, true);
  assert.equal(JSON.stringify(loadNavigationStack()).includes("private-secret"), false);
  assert.equal(popNavigationStep().params.episode, 15);
  clearNavigationStack();
  assert.equal(initialLobbyNavigation(null, "", loadNavigationStack()).tab, "home");
});

test("corrupt storage is harmless and navigation retains only the last thirty public steps", t => {
  const data = browserStorage(t), key = "anirium_nav_stack_v1";
  for (const value of ["{", "null", '{"unexpected":true}', '[null,{"type":"admin","id":20}]']) {
    data.set(key, value); assert.deepEqual(loadNavigationStack(), []);
  }
  for (let episode = 1; episode <= 35; episode++) pushNavigationStep({ type: "episode", id: 21881, path: "/", label: "SAO II", params: { episode } });
  const stack = loadNavigationStack();
  assert.equal(stack.length, 30);
  assert.equal(stack[0].params.episode, 6);
  assert.equal(stack.at(-1).params.episode, 35);
});
