import assert from 'node:assert/strict';
import { projectTypescript } from './lib/project-typescript.mjs';
const runtime = projectTypescript();
try {
  const { bleachReferenceCase: data, relatedReferenceTitles } = runtime.load('src/lib/bleachReferenceCase.ts');
  const titles = new Set(data.titles.map(title => title.key));
  assert.equal(titles.size, data.titles.length);
  for (const edge of data.relations) {
    assert.ok(titles.has(edge.from) && titles.has(edge.to));
    assert.ok(edge.source.startsWith('https://'));
  }
  const arcs = new Set(data.arcs.map(arc => arc.key));
  for (const position of data.narrativePositions) {
    assert.ok(titles.has(position.titleKey) && arcs.has(position.afterArc));
  }
  for (const release of data.releases) {
    assert.ok(titles.has(release.titleKey));
    assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(release.date).toISOString().slice(0, 10), release.date);
  }
  assert.equal(relatedReferenceTitles('zombiepowder', 'shared-universe').length, 0);
  assert.equal(relatedReferenceTitles('zombiepowder', 'same-creator').length, 1);
  assert.equal(relatedReferenceTitles('burn-the-witch', 'shared-universe').length, 1);
  assert.ok(data.titles.every(title => title.canon.status === 'unknown' && title.canon.source === null));
  assert.ok(data.arcs.every(arc => arc.episodeMembership === 'pending'));
  assert.equal(data.titles.find(title => title.key === 'bleach-tv').episodeCount, 366);
  assert.equal(data.productionSeed, false);
  console.log(JSON.stringify({ titles: titles.size, relations: data.relations.length, arcs: arcs.size, cours: data.releaseGroups.length, releaseEvents: data.releases.length, productionSeed: false }));
} finally {
  await runtime.close();
}
