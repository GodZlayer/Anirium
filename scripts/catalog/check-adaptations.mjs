import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite');
const sampleAdap = db.prepare(`
  SELECT r.relation_type, 
         w1.title as from_title, w1.media as from_media, 
         w2.title as to_title, w2.media as to_media 
  FROM catalog_work_relations r 
  JOIN catalog_works w1 ON r.from_work_id = w1.id 
  JOIN catalog_works w2 ON r.to_work_id = w2.id 
  WHERE r.relation_type IN ('adaptation', 'source') 
  LIMIT 5
`).all();
console.log(sampleAdap);
