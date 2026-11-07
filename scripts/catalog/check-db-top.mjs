import { loadCatalog } from './load-catalog.mjs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const catalog = await loadCatalog(path.resolve('public/data/catalog.parquet'));
const db = new DatabaseSync('database/database.sqlite');
const getExt = db.prepare("SELECT entity_id FROM catalog_external_identities WHERE provider = 'mal' AND external_id = ?");
const getTitles = db.prepare("SELECT locale, title FROM catalog_entity_titles WHERE entity_id = ?");

let matched = 0, foundPt = 0, foundEs = 0, foundFr = 0, foundDe = 0;
for (const r of catalog.rows.slice(0, 500)) {
  if (r.mal_id) {
    const ext = getExt.get(String(r.mal_id));
    if (ext) {
      matched++;
      const titles = getTitles.all(ext.entity_id);
      for (const t of titles) {
        if (t.locale === 'pt' || t.locale === 'pt-BR') foundPt++;
        if (t.locale === 'es') foundEs++;
        if (t.locale === 'fr') foundFr++;
        if (t.locale === 'de') foundDe++;
      }
    }
  }
}
console.log({ matched, foundPt, foundEs, foundFr, foundDe });
