import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='catalog_work_relations'").get().sql);
const idx = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='catalog_work_relations'").all();
console.log('Indexes on relations:', idx.map(i => i.sql));
