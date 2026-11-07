import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite');
const sample = db.prepare("SELECT * FROM catalog_entity_titles WHERE locale IN ('pt', 'pt-BR', 'es') LIMIT 5").all();
console.log(sample);
