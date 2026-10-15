import readline from 'node:readline';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://anirium:anirium_master_key_2026@127.0.0.1:5435/anirium_canonical',
  max: 10
});

const UPSERT_QUERY = `
INSERT INTO anime_catalog (
    mal_id, id_mal, title, title_english, title_japanese, title_portuguese,
    synonyms_json, images_json, synopsis, score, scored_by, popularity,
    episodes, status, category, genres_json, tags_json, studios_json,
    year, format, banner_image, streaming_links_json, seasons_json,
    universe_id, franchise_root, relation_type, next_airing_episode_json,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22, $23,
    $24, $25, $26, $27,
    $28
)
ON CONFLICT (mal_id) DO UPDATE SET
    id_mal = EXCLUDED.id_mal,
    title = EXCLUDED.title,
    title_english = COALESCE(EXCLUDED.title_english, anime_catalog.title_english),
    title_japanese = COALESCE(EXCLUDED.title_japanese, anime_catalog.title_japanese),
    synonyms_json = EXCLUDED.synonyms_json,
    images_json = EXCLUDED.images_json,
    synopsis = COALESCE(EXCLUDED.synopsis, anime_catalog.synopsis),
    score = COALESCE(EXCLUDED.score, anime_catalog.score),
    scored_by = COALESCE(EXCLUDED.scored_by, anime_catalog.scored_by),
    popularity = COALESCE(EXCLUDED.popularity, anime_catalog.popularity),
    episodes = COALESCE(EXCLUDED.episodes, anime_catalog.episodes),
    status = EXCLUDED.status,
    category = EXCLUDED.category,
    genres_json = EXCLUDED.genres_json,
    studios_json = EXCLUDED.studios_json,
    year = COALESCE(EXCLUDED.year, anime_catalog.year),
    format = EXCLUDED.format,
    updated_at = EXCLUDED.updated_at;
`;

function mapAnime(data) {
  const mal_id = data.id;
  if (!mal_id) return null;

  const title = data.title || 'Unknown Title';
  const alt = data.alternative_titles || {};
  const title_en = alt.en || null;
  const title_ja = alt.ja || null;
  const synonyms = alt.synonyms || [];

  const pic = data.main_picture || {};
  const images_json = JSON.stringify({
    jpg: {
      image_url: pic.medium || '',
      large_image_url: pic.large || pic.medium || ''
    }
  });

  const synopsis = data.synopsis || null;
  const score = data.mean != null ? Number(data.mean) : null;
  const num_scoring = data.num_scoring_users || null;
  const popularity = data.popularity || null;
  const episodes = data.num_episodes || null;

  const status_raw = data.status || '';
  let status = 'FINISHED';
  if (status_raw === 'currently_airing') status = 'RELEASING';
  else if (status_raw === 'not_yet_aired') status = 'NOT_YET_RELEASED';

  const media_type = (data.media_type || '').toLowerCase();
  let format_val = 'TV';
  if (media_type === 'movie') format_val = 'MOVIE';
  else if (media_type === 'ova') format_val = 'OVA';
  else if (media_type === 'ona') format_val = 'ONA';
  else if (media_type === 'special') format_val = 'SPECIAL';
  else if (media_type === 'music') format_val = 'MUSIC';

  let category = popularity && popularity <= 1000 ? 'popular' : 'catalog_archive';
  if (status === 'RELEASING') category = 'seasonal';
  else if (status === 'NOT_YET_RELEASED') category = 'upcoming';

  const genres = (data.genres || []).map(g => g.name).filter(Boolean);
  const studios = (data.studios || []).map(s => s.name).filter(Boolean);

  let year = data.start_season?.year || null;
  if (!year && data.start_date) {
    const y = parseInt(data.start_date.slice(0, 4), 10);
    if (!isNaN(y)) year = y;
  }

  const now_ms = Date.now();

  return [
    mal_id,
    mal_id,
    title,
    title_en,
    title_ja,
    null,
    JSON.stringify(synonyms),
    images_json,
    synopsis,
    score,
    num_scoring,
    popularity,
    episodes,
    status,
    category,
    JSON.stringify(genres),
    JSON.stringify([]),
    JSON.stringify(studios),
    year,
    format_val,
    null,
    JSON.stringify([]),
    JSON.stringify([]),
    `mal-${mal_id}`,
    `mal-${mal_id}`,
    'MAIN',
    null,
    now_ms
  ];
}

async function main() {
  console.log('Iniciando ingestor direto de anime_dump.ndjson para PostgreSQL...');
  const fileStream = (await import('node:fs')).createReadStream('anime_dump.ndjson');
  const rl = readline.createInterface({
    input: fileStream,
    terminal: false
  });

  let buffer = [];
  let inserted = 0;

  async function flush() {
    if (buffer.length === 0) return;
    const items = buffer;
    buffer = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const params of items) {
        await client.query(UPSERT_QUERY, params);
      }
      await client.query('COMMIT');
      inserted += items.length;
      if (inserted % 2000 === 0 || inserted === items.length) {
        console.log(`[Autônomo] ${inserted} animes sincronizados no catálogo PostgreSQL...`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Erro no lote:', err.message);
    } finally {
      client.release();
    }
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      const params = mapAnime(data);
      if (params) {
        buffer.push(params);
        if (buffer.length >= 250) {
          await flush();
        }
      }
    } catch (err) {
      // ignora linhas invalidas
    }
  }

  await flush();
  await pool.end();
  console.log(`[Finalizado] Total de animes sincronizados com sucesso: ${inserted}`);
}

main().catch(err => {
  console.error('Falha geral:', err);
  process.exit(1);
});
