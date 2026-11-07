import { DatabaseSync } from 'node:sqlite';
import { loadCatalog } from './load-catalog.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';

console.log('[PopulatePureMesh] Iniciando povoamento relacional das novas tabelas...');
const db = new DatabaseSync('database/database.sqlite');
db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=OFF; PRAGMA synchronous=OFF;');

// 1. Inserir Papéis Fundamentais (Roles)
const roles = [
  { id: 'role_author', token: 'author' },
  { id: 'role_director', token: 'director' },
  { id: 'role_illustrator', token: 'illustrator' },
  { id: 'role_writer', token: 'writer' },
  { id: 'role_composer', token: 'composer' },
  { id: 'role_seiyuu', token: 'seiyuu' },
  { id: 'role_character_designer', token: 'character_designer' },
  { id: 'role_sound_director', token: 'sound_director' },
  { id: 'role_studio', token: 'studio' },
];

const insertRole = db.prepare('INSERT OR IGNORE INTO catalog_roles (id, token) VALUES (?, ?)');
for (const r of roles) {
  insertRole.run(r.id, r.token);
}
console.log(`[PopulatePureMesh] Papéis fundamentais cadastrados (${roles.length}).`);

// Helper para gerar UUID v5 determinístico via SHA-256
function deterministicId(namespace, name) {
  const hash = createHash('sha256').update(`${namespace}:${name}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// 2. Extrair e Normalizar Estúdios do Parquet
const catalog = await loadCatalog(path.resolve('public/data/catalog.parquet'));
console.log(`[PopulatePureMesh] Lendo ${catalog.rows.length} registros do catálogo Parquet...`);

const insertStudio = db.prepare("INSERT OR IGNORE INTO catalog_studios (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))");
const insertWorkStudio = db.prepare('INSERT OR IGNORE INTO catalog_work_studios (work_id, studio_id) VALUES (?, ?)');

db.exec('BEGIN IMMEDIATE');
let studiosCount = 0;
let workStudiosCount = 0;
const knownStudios = new Set();

for (const row of catalog.rows) {
  if (!row.id) continue;
  const workId = row.work_id || row.id;

  if (row.studios_json) {
    try {
      const parsed = typeof row.studios_json === 'string' ? JSON.parse(row.studios_json) : row.studios_json;
      if (Array.isArray(parsed)) {
        for (const st of parsed) {
          const studioName = st.name || st.title;
          if (!studioName) continue;
          const studioId = deterministicId('studio', studioName);
          if (!knownStudios.has(studioId)) {
            insertStudio.run(studioId, studioName);
            knownStudios.add(studioId);
            studiosCount++;
          }
          insertWorkStudio.run(workId, studioId);
          workStudiosCount++;
        }
      }
    } catch (_) {}
  }
}
db.exec('COMMIT');
console.log(`[PopulatePureMesh] Estúdios cadastrados: ${studiosCount} únicos, ${workStudiosCount} interseções obra <-> estúdio.`);

// 3. Cadastrar Criadores Canônicos e suas Relações de IDs
const creators = [
  { name: 'Koyoharu Gotouge', native: '吾峠 呼世晴', role: 'role_author', works: ['259cb175-284a-417e-92ec-f3895d0c49b0', 'e5ee596b-5f44-46ca-a3fb-7840c9066e85', 'a8277dca-278f-4ceb-836f-88e10236896a'] },
  { name: 'Haruo Sotozaki', native: '外崎 春雄', role: 'role_director', works: ['259cb175-284a-417e-92ec-f3895d0c49b0', 'e5ee596b-5f44-46ca-a3fb-7840c9066e85'] },
  { name: 'Yuki Kajiura', native: '梶浦 由記', role: 'role_composer', works: ['259cb175-284a-417e-92ec-f3895d0c49b0', 'e5ee596b-5f44-46ca-a3fb-7840c9066e85'] },
  { name: 'Go Shiina', native: '椎名 豪', role: 'role_composer', works: ['259cb175-284a-417e-92ec-f3895d0c49b0', 'e5ee596b-5f44-46ca-a3fb-7840c9066e85'] },
  { name: 'Natsuki Hanae', native: '花江 夏樹', role: 'role_seiyuu', works: ['259cb175-284a-417e-92ec-f3895d0c49b0', 'e5ee596b-5f44-46ca-a3fb-7840c9066e85'] },
  { name: 'Akira Toriyama', native: '鳥山 明', role: 'role_author', works: [] },
  { name: 'Eiichiro Oda', native: '尾田 栄一郎', role: 'role_author', works: [] },
  { name: 'Hayao Miyazaki', native: '宮崎 駿', role: 'role_director', works: [] },
  { name: 'Makoto Shinkai', native: '新海 誠', role: 'role_director', works: [] },
  { name: 'Hiroyuki Sawano', native: '澤野 弘之', role: 'role_composer', works: [] }
];

const insertCreator = db.prepare("INSERT OR IGNORE INTO catalog_creators (id, name, native_name, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))");
const insertWorkCreator = db.prepare('INSERT OR IGNORE INTO catalog_work_creators (work_id, creator_id, role_id) VALUES (?, ?, ?)');

db.exec('BEGIN IMMEDIATE');
for (const c of creators) {
  const creatorId = deterministicId('creator', c.name);
  insertCreator.run(creatorId, c.name, c.native);
  for (const wId of c.works) {
    insertWorkCreator.run(wId, creatorId, c.role);
  }
}
db.exec('COMMIT');
console.log(`[PopulatePureMesh] Criadores e papéis canônicos inseridos com sucesso.`);

// 4. Cadastrar Trilhas Sonoras (BGM) e Interseções de ID
const tracks = [
  { title: 'Homura (炎)', composer: 'Yuki Kajiura', type: 'theme', works: ['e5ee596b-5f44-46ca-a3fb-7840c9066e85', '259cb175-284a-417e-92ec-f3895d0c49b0'] },
  { title: 'Akeboshi (明け星)', composer: 'Yuki Kajiura', type: 'op', works: ['259cb175-284a-417e-92ec-f3895d0c49b0'] },
  { title: 'Shirogane (白銀)', composer: 'Yuki Kajiura', type: 'ed', works: ['259cb175-284a-417e-92ec-f3895d0c49b0'] },
  { title: 'Rengoku Kyojuro BGM Suite', composer: 'Go Shiina', type: 'bgm', works: ['e5ee596b-5f44-46ca-a3fb-7840c9066e85', '259cb175-284a-417e-92ec-f3895d0c49b0'] }
];

const insertTrack = db.prepare("INSERT OR IGNORE INTO catalog_tracks (id, composer_id, title, track_type, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))");
const insertWorkTrack = db.prepare('INSERT OR IGNORE INTO catalog_work_tracks (work_id, track_id) VALUES (?, ?)');

db.exec('BEGIN IMMEDIATE');
for (const tr of tracks) {
  const trackId = deterministicId('track', tr.title);
  const composerId = deterministicId('creator', tr.composer);
  insertTrack.run(trackId, composerId, tr.title, tr.type);
  for (const wId of tr.works) {
    insertWorkTrack.run(wId, trackId);
  }
}
db.exec('COMMIT');
console.log(`[PopulatePureMesh] Trilhas sonoras e conexões de obras cadastradas.`);

// 5. Tabela de Strings de Sistema (Zero Hardcode)
const stringsData = [
  { token: 'lbl_universe', pt: 'Universo Canônico', en: 'Canonical Universe', ja: 'カノニカル・ユニバース' },
  { token: 'lbl_arc', pt: 'Arco Narrativo', en: 'Narrative Arc', ja: '物語編' },
  { token: 'lbl_work', pt: 'Obra / Manifestação', en: 'Work / Manifestation', ja: '作品' },
  { token: 'lbl_episode', pt: 'Episódio', en: 'Episode', ja: 'エピソード' },
  { token: 'lbl_creator', pt: 'Criador', en: 'Creator', ja: 'クリエイター' },
  { token: 'lbl_studio', pt: 'Estúdio de Produção', en: 'Production Studio', ja: '制作スタジオ' },
  { token: 'lbl_track', pt: 'Trilha Sonora (BGM)', en: 'Soundtrack (BGM)', ja: '劇中曲・BGM' },
  { token: 'lbl_fidelity', pt: 'Fidelidade Narrativa', en: 'Narrative Fidelity', ja: '原作再現度' },
  { token: 'lbl_real_capacity', pt: 'Capacidade Real do Criador', en: 'Real Creator Capacity', ja: 'クリエイターの実力値' },
  { token: 'lbl_manifestations', pt: 'Formas de Vivenciar a História', en: 'Ways to Experience the Story', ja: '物語の体験形態' },
  { token: 'lbl_discussion', pt: 'Debate da Comunidade', en: 'Community Discussion', ja: 'コミュニティ議論' }
];

const insertString = db.prepare('INSERT OR REPLACE INTO system_strings (token, pt_br, en_us, ja_jp) VALUES (?, ?, ?, ?)');
db.exec('BEGIN IMMEDIATE');
for (const s of stringsData) {
  insertString.run(s.token, s.pt, s.en, s.ja);
}
db.exec('COMMIT');
console.log(`[PopulatePureMesh] Strings de sistema registradas (${stringsData.length}).`);

// 6. Tabela de Temas de Sistema (Cores e Geometria)
const themesData = [
  { token: 'color_bg_base', amoled: '#000000', cyberpunk: '#050508', default_dark: '#0e0e12' },
  { token: 'color_bg_surface', amoled: '#080808', cyberpunk: '#0e0b16', default_dark: '#141419' },
  { token: 'color_border', amoled: '#1a1a1a', cyberpunk: '#ff007f', default_dark: '#26262e' },
  { token: 'color_accent_emerald', amoled: '#10b981', cyberpunk: '#00ffcc', default_dark: '#10b981' },
  { token: 'color_accent_purple', amoled: '#8b5cf6', cyberpunk: '#d946ef', default_dark: '#8b5cf6' },
  { token: 'color_accent_amber', amoled: '#f59e0b', cyberpunk: '#ffe600', default_dark: '#f59e0b' }
];

const insertTheme = db.prepare('INSERT OR REPLACE INTO system_themes (token, amoled, cyberpunk, default_dark) VALUES (?, ?, ?, ?)');
db.exec('BEGIN IMMEDIATE');
for (const th of themesData) {
  insertTheme.run(th.token, th.amoled, th.cyberpunk, th.default_dark);
}
db.exec('COMMIT');
console.log(`[PopulatePureMesh] Temas de sistema registrados (${themesData.length}).`);

console.log('[PopulatePureMesh] Finalizado com 100% de sucesso!');
