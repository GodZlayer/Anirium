import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadCatalog } from './load-catalog.mjs';
import { publishCatalog } from './publish-catalog.mjs';

const DB_PATH = path.resolve('database/database.sqlite');
const PARQUET_PATH = path.resolve('public/data/catalog.parquet');
const CACHE_PATH = path.resolve('storage/app/catalog/translation_cache.json');

// Ensure cache directory exists
fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
let cache = {};
if (fs.existsSync(CACHE_PATH)) {
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    cache = {};
  }
}

function saveCache() {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

async function fetchGoogleTranslation(text, targetLang, sourceLang = 'en') {
  if (!text || !text.trim()) return '';
  const trimmed = text.trim();
  const cacheKey = `${sourceLang}->${targetLang}:${trimmed}`;
  if (cache[cacheKey]) return cache[cacheKey];

  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(trimmed)}`;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 200) {
        const json = await res.json();
        let translated = '';
        if (Array.isArray(json)) {
          translated = json[0] || '';
        } else if (typeof json === 'string') {
          translated = json;
        }
        if (translated) {
          cache[cacheKey] = translated;
          return translated;
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return '';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('[AutoLocalizationEngine] Starting Phase 1...');
  const catalog = await loadCatalog(PARQUET_PATH);
  console.log(`[AutoLocalizationEngine] Loaded catalog: ${catalog.rows.length} rows.`);

  const db = new DatabaseSync(DB_PATH);
  const getExt = db.prepare("SELECT entity_id FROM catalog_external_identities WHERE provider = 'mal' AND external_id = ?");
  const getExistingDbTitles = db.prepare("SELECT locale, title FROM catalog_entity_titles WHERE entity_id = ?");
  const insertTitleStmt = db.prepare("INSERT OR REPLACE INTO catalog_entity_titles (entity_id, locale, title) VALUES (?, ?, ?)");

  // Select target batch: All with airing_day (active calendar) + Top 120 popular
  const releasingAiring = catalog.rows.filter(r => r.status === 'RELEASING' && r.airing_day != null);
  const top120 = catalog.rows.slice().sort((a,b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 120);
  
  const targetsMap = new Map();
  for (const r of releasingAiring) targetsMap.set(r.id, r);
  for (const r of top120) targetsMap.set(r.id, r);

  const targets = Array.from(targetsMap.values());
  console.log(`[AutoLocalizationEngine] Targets identified: ${targets.length} priority works.`);

  let processedCount = 0;
  let translatedTitlesCount = 0;
  let translatedSynopsesCount = 0;

  for (const row of targets) {
    processedCount++;
    const entityExt = row.mal_id ? getExt.get(String(row.mal_id)) : null;
    const entityId = entityExt ? entityExt.entity_id : null;

    // Check existing official titles in DB
    const existingDbMap = {};
    if (entityId) {
      const titles = getExistingDbTitles.all(entityId);
      for (const t of titles) {
        existingDbMap[t.locale] = t.title;
      }
    }

    // Languages mapping
    // Target locales: pt-BR (pt), es-ES (es), fr-FR (fr), de-DE (de)
    const locales = [
      { code: 'pt', field: 'title_portuguese', dbLocales: ['pt', 'pt-BR'], synKey: 'pt-BR' },
      { code: 'es', field: 'title_spanish', dbLocales: ['es', 'es-ES'], synKey: 'es-ES' },
      { code: 'fr', field: 'title_french', dbLocales: ['fr', 'fr-FR'], synKey: 'fr-FR' },
      { code: 'de', field: 'title_german', dbLocales: ['de', 'de-DE'], synKey: 'de-DE' },
    ];

    // Determine base title for translation
    const baseTitle = row.title_english || row.title;

    // 1. Title localization
    for (const loc of locales) {
      // Rule: If already exists in row or DB, preserve original and NEVER overwrite
      let existing = row[loc.field];
      if (!existing && entityId) {
        for (const dbl of loc.dbLocales) {
          if (existingDbMap[dbl]) {
            existing = existingDbMap[dbl];
            break;
          }
        }
      }

      if (existing) {
        row[loc.field] = existing;
      } else if (baseTitle) {
        // Translate missing title
        const translated = await fetchGoogleTranslation(baseTitle, loc.code, 'en');
        if (translated) {
          row[loc.field] = translated;
          translatedTitlesCount++;
          if (entityId) {
            try {
              insertTitleStmt.run(entityId, loc.dbLocales[0], translated);
            } catch {}
          }
        }
        await sleep(50);
      }
    }

    // 2. Synopses localization
    if (row.synopsis && row.synopsis.trim().length > 0) {
      let synMap = {};
      if (row.synopses_json) {
        try {
          synMap = JSON.parse(row.synopses_json);
        } catch {
          synMap = {};
        }
      }
      // Ensure en-US is populated
      if (!synMap['en-US']) {
        synMap['en-US'] = row.synopsis;
      }

      for (const loc of locales) {
        if (!synMap[loc.synKey]) {
          const translatedSyn = await fetchGoogleTranslation(row.synopsis, loc.code, 'en');
          if (translatedSyn) {
            synMap[loc.synKey] = translatedSyn;
            translatedSynopsesCount++;
          }
          await sleep(60);
        }
      }

      row.synopses_json = JSON.stringify(synMap);
    }

    if (processedCount % 20 === 0 || processedCount === targets.length) {
      console.log(`[AutoLocalizationEngine] Progress: ${processedCount}/${targets.length} works (Titles translated: ${translatedTitlesCount}, Synopses: ${translatedSynopsesCount})`);
      saveCache();
    }
  }

  saveCache();
  console.log('[AutoLocalizationEngine] Translation loop complete.');
  console.log(`[AutoLocalizationEngine] Re-publishing ${catalog.rows.length} works to ${PARQUET_PATH}...`);

  // Ensure new columns exist on all rows for schema consistency
  for (const r of catalog.rows) {
    if (r.title_spanish === undefined) r.title_spanish = null;
    if (r.title_french === undefined) r.title_french = null;
    if (r.title_german === undefined) r.title_german = null;
    if (r.synopses_json === undefined) r.synopses_json = null;
  }

  await publishCatalog(catalog.rows, catalog.rows, PARQUET_PATH, { preservePrevious: true });
  console.log('[AutoLocalizationEngine] Phase 1 published successfully!');
}

main().catch(err => {
  console.error('[AutoLocalizationEngine] Error:', err);
  process.exit(1);
});
