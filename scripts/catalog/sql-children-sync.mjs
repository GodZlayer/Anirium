import { registryConnection } from "./sql-registry-connection.mjs";
import { SqlChildIdentities } from "./sql-child-identities.mjs";
import { SqlChildEpisodes } from "./sql-child-episodes.mjs";
import { SqlChildArcs } from "./sql-child-arcs.mjs";
import { childHash, readChildInput } from "./sql-child-input.mjs";

export function syncSqlChildren(rows, directory, { database = process.env.CATALOG_IDENTITY_DATABASE } = {}) {
  const db = registryConnection(database), report = { works: 0, skipped: 0, episodes: 0, arcs: 0 };
  try {
    const identities = new SqlChildIdentities(db), episodes = new SqlChildEpisodes(db, identities), arcs = new SqlChildArcs(db, identities);
    const revision = db.prepare("SELECT input_sha256 FROM catalog_work_child_revisions WHERE work_id=?");
    const save = db.prepare("INSERT INTO catalog_work_child_revisions(work_id,input_sha256) VALUES(?,?) ON CONFLICT(work_id) DO UPDATE SET input_sha256=excluded.input_sha256");
    const aliases = db.prepare("SELECT alias FROM catalog_entity_aliases WHERE kind='work' AND entity_id=? ORDER BY alias");
    const membership = db.prepare("SELECT universe_id FROM catalog_universe_works WHERE work_id=? ORDER BY universe_id");
    const work = db.prepare("SELECT media FROM catalog_works WHERE id=?");
    const commit = apply => {
      db.exec("BEGIN IMMEDIATE");
      try { apply(); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
    };
    for (const row of rows) {
      if (["MANGA", "NOVEL"].includes(row.entity_type)) continue;
      if (work.get(row.work_id)?.media !== "anime") throw new Error("SQL children require an existing anime work UUID");
      const names = aliases.all(row.work_id).map(item => item.alias), universes = membership.all(row.work_id).map(item => item.universe_id);
      const input = { schema: 1, work: row.work_id, mal: row.mal_id, aliases: names, universes,
        document: row.episodes_metadata_url, filler: row.filler_episodes_json, arcs: row.arcs_json,
        total: row.episodes ?? row.episodes_count, format: row.format };
      const hash = childHash(input);
      if (revision.get(row.work_id)?.input_sha256 === hash) { report.skipped++; continue; }
      const children = readChildInput(row, directory);
      for (let offset = 0; offset < children.episodes.length; offset += 250) {
        commit(() => { for (const record of children.episodes.slice(offset, offset + 250)) episodes.write(row.work_id, record, names); });
      }
      commit(() => {
        for (const record of children.arcs) arcs.write(row.work_id, universes, record);
        save.run(row.work_id, hash);
      });
      report.works++; report.episodes += children.episodes.length; report.arcs += children.arcs.length;
    }
    return report;
  } finally { db.close(); }
}
