import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySubtitleBundle, mergeSubtitleBundle, selectBundledSubtitle, bundledSubtitleAhead } from '../resources/js/addons/player-pro/subtitleBundle.ts';

const part = (start, text, failed = false) => ({ start, end: start + 60, failed, cues: text ? [{ start: start + 1, end: start + 4, text }] : [] });
const track = (id, parts, embedded = true) => ({ id, language: id, status: 'ready', alignment: embedded ? 'verified' : 'unverified', embedded, complete: !embedded, parts });
const payload = tracks => ({ version: 1, epoch: 1, revision: 1, source: 'source-one', reset: true, tracks });

test('switches already loaded languages locally and retains alternatives', () => {
  const state = mergeSubtitleBundle(emptySubtitleBundle(), payload([track('eng', [part(0, '<i>Hello</i>')]), track('por', [part(0, 'Olá')])]));
  const before = JSON.stringify(state);
  for (let i = 0; i < 100; i++) {
    assert.equal(selectBundledSubtitle(state, i % 2 ? 'eng' : 'por', 2, 'source-one').cues[0].text, i % 2 ? 'Hello' : 'Olá');
  }
  assert.equal(JSON.stringify(state), before);
});

test('merges interval deltas without duplicates or losing silence coverage', () => {
  let state = mergeSubtitleBundle(emptySubtitleBundle(), payload([track('eng', [part(0, '')])]));
  const next = { ...payload([track('eng', [part(60, 'Later')])]), reset: false, revision: 2 };
  state = mergeSubtitleBundle(mergeSubtitleBundle(state, next), next);
  assert.equal(state.tracks.eng.parts.length, 2);
  assert.equal(bundledSubtitleAhead(state, 45, 'source-one'), 75);
  assert.equal(selectBundledSubtitle(state, 'eng', 20, 'source-one').status, 'ready');
});

test('source replacement discards old cues and refuses mismatched source', () => {
  const old = mergeSubtitleBundle(emptySubtitleBundle(), payload([track('eng', [part(0, 'Old')])]));
  assert.equal(selectBundledSubtitle(old, 'eng', 2, 'other-source').status, 'loading');
  const next = mergeSubtitleBundle(old, { ...payload([]), epoch: 2, revision: 3, source: 'source-two' });
  assert.deepEqual(next.tracks, {});
  assert.equal(bundledSubtitleAhead(next, 0, 'source-one'), 60);
  assert.equal(selectBundledSubtitle(next, 'eng', 2, 'source-one').status, 'ready');
  assert.equal(selectBundledSubtitle(next, 'eng', 2, 'source-two').status, 'loading');
});

test('failed embedded interval is terminal and external pending does not gate video', () => {
  const state = mergeSubtitleBundle(emptySubtitleBundle(), payload([track('eng', [part(0, '', true)]), { ...track('external', [], false), status: 'preparing', complete: false }]));
  assert.equal(selectBundledSubtitle(state, 'eng', 2, 'source-one').status, 'failed');
  assert.equal(selectBundledSubtitle(state, 'external', 2, 'source-one').status, 'loading');
  assert.equal(bundledSubtitleAhead(state, 0, 'source-one'), 60);
});

test('rejects invalid interval payloads and decreasing revisions', () => {
  assert.throws(() => mergeSubtitleBundle(emptySubtitleBundle(), payload([track('eng', [{ ...part(0, 'Bad'), end: -1 }])])));
  const state = mergeSubtitleBundle(emptySubtitleBundle(), payload([]));
  assert.throws(() => mergeSubtitleBundle(state, { ...payload([]), revision: 0, reset: false }));
});
