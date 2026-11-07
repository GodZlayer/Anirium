import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });
const arc = db.prepare("SELECT * FROM catalog_arcs LIMIT 1").get();
console.log('Sample Arc:', arc);
const ent = db.prepare("SELECT * FROM catalog_entities WHERE id = ?").get(arc.id);
console.log('In catalog_entities:', ent);
