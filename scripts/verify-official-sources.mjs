import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';

const source = fs.readFileSync('src/lib/officialSources.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { filterOfficialStreamingLinks } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const official = { url: 'https://www.crunchyroll.com/series/fixture', type: 'STREAMING' };
const spoofed = [
  { url: 'https://crunchyroll.com.external.invalid/watch', site: 'Crunchyroll' },
  { url: 'https://external.invalid/watch', site: 'Netflix' },
  { url: 'https://netflix.com@external.invalid/watch' },
  { url: 'http://www.netflix.com/title/fixture' },
  { url: 'javascript:alert(1)' },
  { url: 'https://www.crunchyroll.com/search?q=fixture' },
  { url: official.url, type: 'SOCIAL' },
];
assert.deepEqual(filterOfficialStreamingLinks([official, ...spoofed]), [official]);
assert.deepEqual(filterOfficialStreamingLinks(undefined), []);
console.log('Official source destinations verified: spoofed, unsafe and unknown links rejected.');
