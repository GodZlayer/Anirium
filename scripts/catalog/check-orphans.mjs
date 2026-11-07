import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('database/database.sqlite', { readOnly: true });

const totalWorks = db.prepare('SELECT count(id) as c FROM catalog_works').get().c;
const worksWithUniverse = db.prepare('SELECT count(DISTINCT work_id) as c FROM catalog_universe_works').get().c;
const animeWorks = db.prepare("SELECT count(id) as c FROM catalog_works WHERE media='anime'").get().c;
const animeWithUniverse = db.prepare("SELECT count(DISTINCT uw.work_id) as c FROM catalog_universe_works uw JOIN catalog_works w ON uw.work_id=w.id WHERE w.media='anime'").get().c;

console.log({ totalWorks, worksWithUniverse, animeWorks, animeWithUniverse });

const worksInArcs = db.prepare('SELECT count(DISTINCT work_id) as c FROM catalog_arc_works').get().c;
console.log({ worksInArcs });
