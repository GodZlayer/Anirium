/**
 * sync-airing-schedule.mjs
 * 
 * Sincroniza deterministicamente os horários canônicos de lançamento e episódios
 * da temporada a partir da grade semanal oficial (Timetable) e dos lançamentos
 * recentes (?f=latest).
 * 
 * 1. Grade Semanal (Baseline): Preenche dia da semana e hora (HH:mm) para cada anime.
 * 2. Lançamentos Recentes (Real-Time Override): Preenche os ajustes pontuais de episódio
 *    e timestamp real com precisão de segundo.
 * 3. Atualiza os arquivos public/data/catalog-seasonal.json e public/data/catalog-diff.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const DATA_DIR = path.resolve('public/data');
const SEASONAL_PATH = path.join(DATA_DIR, 'catalog-seasonal.json');
const DIFF_PATH = path.join(DATA_DIR, 'catalog-diff.json');
const SKIP_LINKS = process.argv.includes('--skip-links');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function cleanTitle(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(a, b) {
  const cleanA = cleanTitle(a);
  const cleanB = cleanTitle(b);
  if (!cleanA || !cleanB) return false;
  if (cleanA === cleanB) return true;
  if (cleanA.length > 5 && cleanB.length > 5) {
    return cleanA.includes(cleanB) || cleanB.includes(cleanA);
  }
  return false;
}

export async function runScheduleSync() {
  console.log('[Sync Airing] Iniciando sincronização da grade e horários de lançamento...');

  if (!fs.existsSync(SEASONAL_PATH)) {
    console.error('[Sync Airing] Arquivo catalog-seasonal.json não encontrado em:', SEASONAL_PATH);
    return;
  }

  const seasonal = JSON.parse(fs.readFileSync(SEASONAL_PATH, 'utf8'));
  let diff = fs.existsSync(DIFF_PATH) ? JSON.parse(fs.readFileSync(DIFF_PATH, 'utf8')) : [];

  // Limpa dia/hora gravados em execuções anteriores: muitos foram derivados de updated_at
  // (falsos). A partir daqui só o que vier da grade oficial é gravado de volta.
  for (const list of [seasonal, diff]) {
    for (const a of list) {
      delete a.airing_day;
      delete a.airing_time;
      delete a.airing_source;
    }
  }

  // 1. Obter a grade semanal (Timetable)
  let scheduleData = null;
  try {
    scheduleData = await fetchJson('https://subsplease.org/api/?f=schedule&tz=UTC');
    console.log('[Sync Airing] Grade semanal obtida com sucesso.');
  } catch (err) {
    console.warn('[Sync Airing] Falha ao consultar grade remota:', err.message);
  }

  // 2. Obter os lançamentos recentes das últimas 24-48h (Ajustes pontuais)
  let latestData = null;
  try {
    latestData = await fetchJson('https://subsplease.org/api/?f=latest&tz=UTC');
    console.log('[Sync Airing] Lançamentos recentes obtidos com sucesso.');
  } catch (err) {
    console.warn('[Sync Airing] Falha ao consultar feed de lançamentos:', err.message);
  }

  let scheduleMatches = 0;
  let latestMatches = 0;

  // Processar grade semanal (única fonte de dia/hora de transmissão, em UTC)
  if (scheduleData && scheduleData.schedule) {
    const isAiring = (a) => a.status === 'RELEASING' || a.status === 'AIRING';
    const days = Object.keys(scheduleData.schedule);
    for (const day of days) {
      const items = scheduleData.schedule[day] || [];
      for (const item of items) {
        // Só obras em exibição: uma temporada antiga (FINISHED) nunca herda o dia da atual.
        const pool = [...seasonal, ...diff].filter(isAiring);
        const names = (a) => [a.title, a.title_english].filter(Boolean);
        // Título exato primeiro; só cai para "contém" se não houver nenhum exato.
        let targets = pool.filter(a => names(a).some(n => cleanTitle(n) === cleanTitle(item.title)));
        if (targets.length === 0) {
          targets = pool.filter(a => names(a).some(n => titlesMatch(n, item.title)));
        }

        for (const t of targets) {
          t.airing_day = day;
          t.airing_time = item.time;
          t.airing_source = 'schedule';
          scheduleMatches++;
        }
      }
    }
  }

  // Processar lançamentos pontuais recentes (sobrescrevem com hora exata e número do ep real)
  if (latestData && typeof latestData === 'object') {
    const latestKeys = Object.keys(latestData);
    for (const k of latestKeys) {
      const item = latestData[k];
      const showTitle = item.show;
      const releaseDate = item.release_date;
      const epStr = item.episode;
      const epNum = parseInt(epStr, 10);
      const timestamp = releaseDate ? new Date(releaseDate).getTime() : Date.now();

      const targets = [
        ...seasonal.filter(a => titlesMatch(a.title, showTitle) || (a.title_english && titlesMatch(a.title_english, showTitle))),
        ...diff.filter(a => titlesMatch(a.title, showTitle) || (a.title_english && titlesMatch(a.title_english, showTitle)))
      ];

      for (const t of targets) {
        if (!isNaN(epNum)) {
          t.latest_episode_num = epNum;
        }
        if (timestamp) {
          t.updated_at = timestamp;
        }
        latestMatches++;
      }
    }
  }

  // 3. Obras em exibição que NÃO constam na grade oficial ficam SEM dia/hora.
  // Antes, o dia era derivado de updated_at (horário da ingestão), o que inventava
  // um "dia de transmissão" falso (89% das obras caíam na quinta-feira).
  const unscheduled = seasonal.filter(a => !a.airing_day).length;

  // 4. Ingestão dos Links Oficiais Canônicos (Official Site & Canais Licenciados de Stream)
  console.log('[Sync Airing] Consultando links oficiais reais para o catálogo...');
  // Ordena prioritariamente os animes em exibição e os mais populares
  const targetAnimes = [...seasonal, ...diff.filter(a => a.status === 'RELEASING')];
  const BATCH_SIZE = 8;
  let officialLinksCount = 0;

  for (const anime of targetAnimes.slice(0, SKIP_LINKS ? 0 : 80)) {
    // Tenta primeiro por idMal e depois por id
    const queries = [
      JSON.stringify({ query: `{ Media(idMal: ${anime.mal_id}, type: ANIME) { id idMal siteUrl externalLinks { site url type } } }` }),
      JSON.stringify({ query: `{ Media(id: ${anime.mal_id}, type: ANIME) { id idMal siteUrl externalLinks { site url type } }` })
    ];

    for (const q of queries) {
      try {
        const res = await new Promise((resolve) => {
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
              try { resolve(JSON.parse(body)); } catch (e) { resolve(null); }
            });
          });
          req.on('error', () => resolve(null));
          req.write(q);
          req.end();
        });

        if (res && res.data && res.data.Media) {
          const media = res.data.Media;
          if (Array.isArray(media.externalLinks)) {
            const official = media.externalLinks.find(l => l.site === 'Official Site' || l.type === 'INFO');
            const streamLinks = media.externalLinks
              .filter(l => ['Crunchyroll', 'Netflix', 'Hulu', 'Prime Video', 'Disney Plus', 'HIDIVE', 'Bilibili TV', 'YouTube'].includes(l.site))
              .map(l => ({ site: l.site, url: l.url }));

            if (official && official.url && !anime.official_site_url) {
              anime.official_site_url = official.url;
              officialLinksCount++;
            }
            if (streamLinks.length > 0 && (!anime.streaming_links || anime.streaming_links.length === 0)) {
              anime.streaming_links = streamLinks;
            }
            break; // Já encontrou para este anime
          }
        }
      } catch (e) {}
    }
    // Breve pausa para respeitar rate-limit da API
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`[Sync Airing] Concluído: ${scheduleMatches} obras com dia/hora REAIS da grade oficial (${unscheduled} em exibição sem horário confirmado, deixadas vazias de propósito), ${latestMatches} atualizadas via feed real-time, ${officialLinksCount} links oficiais vinculados.`);

  // Salvar arquivos atualizados
  fs.writeFileSync(SEASONAL_PATH, JSON.stringify(seasonal, null, 2), 'utf8');
  if (diff.length > 0) {
    fs.writeFileSync(DIFF_PATH, JSON.stringify(diff, null, 2), 'utf8');
  }
  console.log('[Sync Airing] public/data/catalog-seasonal.json e catalog-diff.json atualizados com sucesso.');
}

if (process.argv[1] && process.argv[1].endsWith('sync-airing-schedule.mjs')) {
  runScheduleSync().catch(err => {
    console.error('[Sync Airing] Erro:', err);
    process.exit(1);
  });
}
