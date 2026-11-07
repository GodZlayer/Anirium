import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const DATA_DIR = path.resolve('public/data');
const SEASONAL_PATH = path.join(DATA_DIR, 'catalog-seasonal.json');
const POPULAR_PATH = path.join(DATA_DIR, 'catalog-popular.json');
const DIFF_PATH = path.join(DATA_DIR, 'catalog-diff.json');

function queryAniListBatch(ids) {
  // Batch query up to 25 items by searching Page(id_in: [...]) or Page(idMal_in: [...])
  const query = `
    query ($idsMal: [Int], $ids: [Int]) {
      byMal: Page(page: 1, perPage: 50) {
        media(idMal_in: $idsMal, type: ANIME) {
          id
          idMal
          siteUrl
          externalLinks {
            site
            url
            type
          }
        }
      }
      byId: Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME) {
          id
          idMal
          siteUrl
          externalLinks {
            site
            url
            type
          }
        }
      }
    }
  `;

  return new Promise((resolve) => {
    const postData = JSON.stringify({
      query,
      variables: { idsMal: ids, ids: ids }
    });

    const req = https.request('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    }, (resp) => {
      let body = '';
      resp.on('data', c => body += c);
      resp.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (resp.statusCode === 200 && json.data) {
            const list = [
              ...(json.data.byMal?.media || []),
              ...(json.data.byId?.media || [])
            ];
            resolve(list);
          } else {
            console.warn(`[AniList Batch] Status ${resp.statusCode}:`, json.errors || body.slice(0, 100));
            resolve([]);
          }
        } catch (e) {
          console.warn('[AniList Batch] JSON parse error:', e.message);
          resolve([]);
        }
      });
    });

    req.on('error', (err) => {
      console.warn('[AniList Batch] Request error:', err.message);
      resolve([]);
    });

    req.write(postData);
    req.end();
  });
}

const DISTRIBUTOR_DOMAINS = [
  'crunchyroll.com', 'netflix.com', 'hulu.com', 'primevideo.com',
  'disneyplus.com', 'hidive.com', 'tubi.tv', 'pluto.tv', 'bilibili.tv', 'youtube.com'
];

function isStreamingLink(link) {
  if (!link || typeof link.url !== 'string') return false;
  if (link.type === 'INFO' || link.type === 'SOCIAL') return false;
  try {
    const parsed = new URL(link.url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.pathname.toLowerCase().includes('/search') || parsed.searchParams.has('q')) return false;
    return DISTRIBUTOR_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

async function run() {
  console.log('[Populate Streams] Iniciando enriquecimento de canais de streaming oficiais...');

  const seasonal = JSON.parse(fs.readFileSync(SEASONAL_PATH, 'utf8'));
  const popular = JSON.parse(fs.readFileSync(POPULAR_PATH, 'utf8'));
  const diff = fs.existsSync(DIFF_PATH) ? JSON.parse(fs.readFileSync(DIFF_PATH, 'utf8')) : [];

  // Alvos principais: Top seasonal (todos), Top popular (primeiros 200) e releasing no diff
  const targets = [];
  const targetMap = new Map();

  for (const a of seasonal) {
    if (!targetMap.has(a.mal_id)) {
      targetMap.set(a.mal_id, a);
      targets.push(a);
    }
  }

  for (const a of popular.slice(0, 200)) {
    if (!targetMap.has(a.mal_id)) {
      targetMap.set(a.mal_id, a);
      targets.push(a);
    }
  }

  console.log(`[Populate Streams] Total de animes-alvo únicos para consulta: ${targets.length}`);

  // Query in chunks of 40 IDs
  const CHUNK_SIZE = 40;
  let enrichedCount = 0;

  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    const ids = chunk.map(a => a.mal_id).filter(Boolean);

    console.log(`[Populate Streams] Consultando lote ${Math.floor(i / CHUNK_SIZE) + 1} / ${Math.ceil(targets.length / CHUNK_SIZE)} (IDs: ${ids.length})...`);
    const mediaList = await queryAniListBatch(ids);

    for (const m of mediaList) {
      if (!m || !Array.isArray(m.externalLinks)) continue;

      const target = targetMap.get(m.idMal) || targetMap.get(m.id);
      if (!target) continue;

      const streams = m.externalLinks
        .filter(isStreamingLink)
        .map(l => ({ site: l.site, url: l.url }));

      const officialSite = m.externalLinks.find(l => l.site === 'Official Site' || l.type === 'INFO');

      let updatedThis = false;
      if (streams.length > 0 && (!target.streaming_links || target.streaming_links.length === 0)) {
        target.streaming_links = streams;
        updatedThis = true;
      }

      if (officialSite && officialSite.url && !target.official_site_url) {
        target.official_site_url = officialSite.url;
        updatedThis = true;
      }

      if (updatedThis) {
        enrichedCount++;
      }
    }

    // Respeitar rate-limit do AniList (90 req/min -> 1 req a cada 800ms)
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`[Populate Streams] Concluído! ${enrichedCount} obras enriquecidas com links oficiais.`);

  // Propagar links para popular e diff onde o mal_id coincidir
  for (const p of popular) {
    const match = targetMap.get(p.mal_id);
    if (match) {
      if (match.streaming_links) p.streaming_links = match.streaming_links;
      if (match.official_site_url) p.official_site_url = match.official_site_url;
    }
  }

  for (const d of diff) {
    const match = targetMap.get(d.mal_id);
    if (match) {
      if (match.streaming_links) d.streaming_links = match.streaming_links;
      if (match.official_site_url) d.official_site_url = match.official_site_url;
    }
  }

  fs.writeFileSync(SEASONAL_PATH, JSON.stringify(seasonal, null, 2), 'utf8');
  fs.writeFileSync(POPULAR_PATH, JSON.stringify(popular, null, 2), 'utf8');
  if (diff.length > 0) {
    fs.writeFileSync(DIFF_PATH, JSON.stringify(diff, null, 2), 'utf8');
  }

  console.log('[Populate Streams] Arquivos public/data/ catalog-seasonal.json, catalog-popular.json e catalog-diff.json gravados com sucesso!');
}

run().catch(err => {
  console.error('[Populate Streams] Erro:', err);
  process.exit(1);
});
