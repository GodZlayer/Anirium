import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
console.log(db.prepare("SELECT avg(c) a, max(c) m FROM (SELECT count(*) c FROM catalog_entity_aliases WHERE kind='work' GROUP BY entity_id)").get());
console.log(db.prepare("SELECT kind, count(*) c FROM catalog_entity_aliases GROUP BY kind").all());
const w = db.prepare("SELECT entity_id FROM catalog_entity_aliases WHERE kind='work' LIMIT 1").get();
console.log(db.prepare("SELECT alias FROM catalog_entity_aliases WHERE kind='work' AND entity_id=?").all(w.entity_id));
