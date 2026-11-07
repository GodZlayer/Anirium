import { loadCatalog } from './load-catalog.mjs';
import path from 'node:path';

async function main() {
  const catalog = await loadCatalog(path.resolve('public/data/catalog.parquet'));
  console.log('Total rows:', catalog.rows.length);
  const sample = catalog.rows.find(r => r.synopsis && r.synopsis.length > 20);
  console.log('Sample keys:', Object.keys(sample));
  console.log('Sample title:', sample.title);
  console.log('title_english:', sample.title_english);
  console.log('title_japanese:', sample.title_japanese);
  console.log('title_portuguese:', sample.title_portuguese);
  console.log('title_spanish:', sample.title_spanish);
  console.log('title_french:', sample.title_french);
  console.log('title_german:', sample.title_german);
  console.log('synopsis snippet:', sample.synopsis?.slice(0, 100));
  console.log('synopses_json:', sample.synopses_json);

  let ptTitles = 0, enTitles = 0, jaTitles = 0, esTitles = 0, frTitles = 0, deTitles = 0;
  let hasSynopsis = 0, hasSynopsesJson = 0;

  for (const r of catalog.rows) {
    if (r.title_portuguese) ptTitles++;
    if (r.title_english) enTitles++;
    if (r.title_japanese) jaTitles++;
    if (r.title_spanish) esTitles++;
    if (r.title_french) frTitles++;
    if (r.title_german) deTitles++;
    if (r.synopsis) hasSynopsis++;
    if (r.synopses_json) hasSynopsesJson++;
  }

  console.log('\n--- Title Stats ---');
  console.log({ ptTitles, enTitles, jaTitles, esTitles, frTitles, deTitles, hasSynopsis, hasSynopsesJson });
}

main().catch(console.error);
