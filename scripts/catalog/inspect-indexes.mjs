import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
for (const t of ['catalog_external_identities', 'catalog_entity_aliases', 'catalog_work_relations']) {
  console.log(t, db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=?").all(t).map(i => i.sql || i.name));
}
