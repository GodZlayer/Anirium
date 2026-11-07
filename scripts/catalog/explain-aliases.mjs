import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT entity_id FROM catalog_entity_aliases WHERE kind='episode' AND alias='test'").all();
console.log('Query plan for alias lookup:', plan);
const plan2 = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM catalog_entity_aliases WHERE entity_id='test' AND kind='work'").all();
console.log('Query plan for work alias lookup:', plan2);
