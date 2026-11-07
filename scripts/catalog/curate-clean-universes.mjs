import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import path from "node:path";

const dbPath = path.resolve("database/database.sqlite");
console.log(`Conectando ao banco de dados: ${dbPath}`);
const db = new DatabaseSync(dbPath);

console.log("--- 1. Carregando Animes Oficiais ---");
const stmtWorks = db.prepare("SELECT id, title, format, episode_count FROM catalog_works WHERE media='anime'");
const worksRows = stmtWorks.all();
const works = new Map();
for (const w of worksRows) {
  works.set(w.id, w);
}
console.log(`Total de Animes no catálogo: ${works.size}`);

console.log("--- 2. Carregando Relações Canônicas ---");
// Relações que definem a espinha dorsal de uma franquia
const SPINE_RELATIONS = new Set([
  'sequel', 'prequel', 'parent', 'parent_story', 'full_story',
  'alternative_version', 'alternative_setting', 'compilation', 'summary'
]);

// Relações que representam pontes / crossovers (N:N)
const BRIDGE_RELATIONS = new Set([
  'crossover', 'spin_off', 'cameo', 'character'
]);

const ALL_CANONICAL = [...SPINE_RELATIONS, ...BRIDGE_RELATIONS];
const inClause = ALL_CANONICAL.map(r => `'${r}'`).join(",");

const stmtRel = db.prepare(`
  SELECT from_work_id, to_work_id, relation_type 
  FROM catalog_work_relations 
  WHERE from_work_id IS NOT NULL AND to_work_id IS NOT NULL AND relation_type IN (${inClause})
`);
const relRows = stmtRel.all();

// Grafo de Espinha Dorsal (determina o núcleo de cada Universo)
const spineAdj = new Map();
// Relações de Ponte
const bridges = [];

for (const r of relRows) {
  const f = r.from_work_id;
  const t = r.to_work_id;
  if (works.has(f) && works.has(t) && f !== t) {
    if (SPINE_RELATIONS.has(r.relation_type)) {
      if (!spineAdj.has(f)) spineAdj.set(f, new Set());
      if (!spineAdj.has(t)) spineAdj.set(t, new Set());
      spineAdj.get(f).add(t);
      spineAdj.get(t).add(f);
    } else if (BRIDGE_RELATIONS.has(r.relation_type)) {
      bridges.push({ from: f, to: t, type: r.relation_type });
    }
  }
}

console.log(`Obras interligadas na espinha dorsal: ${spineAdj.size}`);
console.log(`Pontes de crossover / spinoff registradas: ${bridges.length}`);

console.log("--- 3. Calculando Franquias Mestras (BFS) ---");
const visited = new Set();
const clusters = [];
const workToUniverseMap = new Map();

for (const node of spineAdj.keys()) {
  if (visited.has(node)) continue;
  const cluster = [];
  const queue = [node];
  visited.add(node);

  while (queue.length > 0) {
    const curr = queue.shift();
    cluster.push(curr);
    const neighbors = spineAdj.get(curr) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  if (cluster.length >= 2) {
    clusters.push(cluster);
  }
}

clusters.sort((a, b) => b.length - a.length);
console.log(`Total de Franquias Mestras consolidadas: ${clusters.length}`);

// Preparar os Universos e as Associações (N:N)
const universes = [];
const universeWorksLinks = []; // Array de { universe_id, work_id }

for (const cluster of clusters) {
  // Escolher a obra âncora (com maior contagem de episódios)
  let anchor = works.get(cluster[0]);
  let maxEps = anchor?.episode_count || 0;
  for (const wId of cluster) {
    const w = works.get(wId);
    if ((w?.episode_count || 0) > maxEps) {
      maxEps = w.episode_count;
      anchor = w;
    }
  }

  const universeId = crypto.randomUUID();
  const universeTitle = `Universo ${anchor.title}`;

  universes.push({
    id: universeId,
    title: universeTitle,
    anchor_id: anchor.id
  });

  for (const wId of cluster) {
    universeWorksLinks.push({ universe_id: universeId, work_id: wId });
    if (!workToUniverseMap.has(wId)) {
      workToUniverseMap.set(wId, new Set());
    }
    workToUniverseMap.get(wId).add(universeId);
  }
}

console.log("--- 4. Conectando Pontes de Crossover e Spinoffs (N:N) ---");
let extraCrossLinks = 0;
for (const b of bridges) {
  const fromUniverses = workToUniverseMap.get(b.from);
  const toUniverses = workToUniverseMap.get(b.to);

  // Se 'from' está num universo e 'to' está em outro, adicionamos a obra crossover nos dois universos
  if (fromUniverses && !toUniverses) {
    for (const uId of fromUniverses) {
      universeWorksLinks.push({ universe_id: uId, work_id: b.to });
      extraCrossLinks++;
    }
  } else if (toUniverses && !fromUniverses) {
    for (const uId of toUniverses) {
      universeWorksLinks.push({ universe_id: uId, work_id: b.from });
      extraCrossLinks++;
    }
  } else if (fromUniverses && toUniverses) {
    // Ambos já têm universos distintos: cada um ganha o vínculo do outro (crossover puro)
    for (const uId of toUniverses) {
      if (!fromUniverses.has(uId)) {
        universeWorksLinks.push({ universe_id: uId, work_id: b.from });
        extraCrossLinks++;
      }
    }
    for (const uId of fromUniverses) {
      if (!toUniverses.has(uId)) {
        universeWorksLinks.push({ universe_id: uId, work_id: b.to });
        extraCrossLinks++;
      }
    }
  }
}

// Remover duplicatas exatas de (universe_id, work_id)
const uniqueLinksMap = new Map();
for (const link of universeWorksLinks) {
  const key = `${link.universe_id}:${link.work_id}`;
  uniqueLinksMap.set(key, link);
}
const finalLinks = Array.from(uniqueLinksMap.values());

console.log(`Vínculos N:N consolidados: ${finalLinks.length} (incluindo ${extraCrossLinks} links de crossover/pontes)`);

console.log("--- 5. Executando Limpeza e Reestruturação no Banco de Dados ---");
db.exec("PRAGMA foreign_keys = OFF;");
db.exec("BEGIN TRANSACTION;");

try {
  console.log("   -> Limpando catalog_universe_works...");
  db.exec("DELETE FROM catalog_universe_works;");

  console.log("   -> Limpando catalog_universes antigas...");
  db.exec("DELETE FROM catalog_universes;");

  console.log("   -> Limpando entidades órfãs do tipo universe...");
  db.exec("DELETE FROM catalog_entities WHERE kind='universe';");

  console.log(`   -> Gravando ${universes.length} Universos Canônicos...`);
  const stmtInsEntity = db.prepare("INSERT INTO catalog_entities (id, kind, resolution_status, created_at, updated_at) VALUES (?, 'universe', 'verified', datetime('now'), datetime('now'))");
  const stmtInsUniv = db.prepare("INSERT INTO catalog_universes (id) VALUES (?)");
  const stmtInsTitle = db.prepare("INSERT OR REPLACE INTO catalog_entity_titles (entity_id, locale, title) VALUES (?, 'pt', ?)");

  for (const u of universes) {
    stmtInsEntity.run(u.id);
    stmtInsUniv.run(u.id);
    stmtInsTitle.run(u.id, u.title);
  }

  console.log(`   -> Gravando ${finalLinks.length} associações de obras a universos...`);
  const stmtInsWorkUniv = db.prepare("INSERT INTO catalog_universe_works (universe_id, work_id) VALUES (?, ?)");
  for (const link of finalLinks) {
    stmtInsWorkUniv.run(link.universe_id, link.work_id);
  }

  db.exec("COMMIT;");
  db.exec("PRAGMA foreign_keys = ON;");
  console.log("\n✓ SUCESSO: Curadoria de Universos Canônicos aplicada com sucesso!");
  console.log(`✓ Total de Universos Reais no Banco: ${universes.length}`);
  console.log(`✓ Total de Vínculos de Obras: ${finalLinks.length}`);
} catch (err) {
  db.exec("ROLLBACK;");
  db.exec("PRAGMA foreign_keys = ON;");
  console.error("Erro ao aplicar alterações:", err);
  process.exit(1);
}
