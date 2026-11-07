import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadRegistry, saveRegistry } from "./registry-store.mjs";

// Unit fixture; CatalogSqlRegistryBridgeTest also exercises the real Laravel migrations.
export function registryStorage(directory) {
  const database = path.join(directory,"identity.sqlite"), db = new DatabaseSync(database);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE catalog_entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,resolution_status TEXT NOT NULL,created_at TEXT,updated_at TEXT);
    CREATE TABLE catalog_works(id TEXT PRIMARY KEY REFERENCES catalog_entities(id),media TEXT NOT NULL,title TEXT NOT NULL,format TEXT,status TEXT,episode_count INTEGER);
    CREATE TABLE catalog_universes(id TEXT PRIMARY KEY REFERENCES catalog_entities(id));
    CREATE TABLE catalog_universe_works(universe_id TEXT REFERENCES catalog_universes(id),work_id TEXT REFERENCES catalog_works(id),PRIMARY KEY(universe_id,work_id));
    CREATE TABLE catalog_work_relations(from_work_id TEXT REFERENCES catalog_works(id),to_work_id TEXT REFERENCES catalog_works(id),relation_type TEXT,provider TEXT,PRIMARY KEY(from_work_id,to_work_id,relation_type,provider));
    CREATE TABLE catalog_external_identities(provider TEXT,namespace TEXT,external_id TEXT,entity_id TEXT REFERENCES catalog_entities(id),PRIMARY KEY(provider,namespace,external_id));
    CREATE TABLE catalog_entity_aliases(kind TEXT,alias TEXT,entity_id TEXT REFERENCES catalog_entities(id),PRIMARY KEY(kind,alias));
    CREATE TABLE catalog_registry_metadata(entity_id TEXT PRIMARY KEY REFERENCES catalog_works(id),account_reference TEXT,media_history TEXT);
    CREATE TABLE catalog_source_redirects(from_reference TEXT PRIMARY KEY,to_reference TEXT,evidence_key TEXT,evidence_json TEXT);
    CREATE TABLE catalog_identity_imports(sha256 TEXT PRIMARY KEY,generation TEXT,records INTEGER,works INTEGER,relations INTEGER,pending_relations INTEGER,complete INTEGER);
    CREATE TABLE catalog_registry_adoptions(generation TEXT PRIMARY KEY,registry_sha256 TEXT,works INTEGER,redirects INTEGER,created_at TEXT);
    CREATE TABLE catalog_entity_titles(entity_id TEXT REFERENCES catalog_entities(id),locale TEXT,title TEXT,PRIMARY KEY(entity_id,locale));
    CREATE TABLE catalog_seasons(id TEXT PRIMARY KEY REFERENCES catalog_entities(id),work_id TEXT REFERENCES catalog_works(id),number INTEGER,UNIQUE(work_id,number),UNIQUE(id,work_id));
    CREATE TABLE catalog_episodes(id TEXT PRIMARY KEY REFERENCES catalog_entities(id),work_id TEXT REFERENCES catalog_works(id),season_id TEXT,numbering_scheme TEXT,number INTEGER,air_date_utc TEXT,classification TEXT,UNIQUE(work_id,numbering_scheme,number),UNIQUE(id,work_id),FOREIGN KEY(season_id,work_id) REFERENCES catalog_seasons(id,work_id));
    CREATE TABLE catalog_arcs(id TEXT PRIMARY KEY REFERENCES catalog_entities(id),universe_id TEXT REFERENCES catalog_universes(id),title TEXT,classification TEXT,source_url TEXT,UNIQUE(id,universe_id));
    CREATE TABLE catalog_arc_works(arc_id TEXT,work_id TEXT,universe_id TEXT,start_number INTEGER,end_number INTEGER,PRIMARY KEY(arc_id,work_id),FOREIGN KEY(arc_id,universe_id) REFERENCES catalog_arcs(id,universe_id),FOREIGN KEY(universe_id,work_id) REFERENCES catalog_universe_works(universe_id,work_id));
    CREATE TABLE catalog_arc_episodes(arc_id TEXT,episode_id TEXT,universe_id TEXT,work_id TEXT,PRIMARY KEY(arc_id,episode_id),FOREIGN KEY(arc_id,universe_id) REFERENCES catalog_arcs(id,universe_id),FOREIGN KEY(episode_id,work_id) REFERENCES catalog_episodes(id,work_id),FOREIGN KEY(universe_id,work_id) REFERENCES catalog_universe_works(universe_id,work_id));
    CREATE TABLE catalog_work_child_revisions(work_id TEXT PRIMARY KEY REFERENCES catalog_works(id),input_sha256 TEXT);`);
  db.close();
  return {database,loadRegistry:file=>loadRegistry(file,{database}),saveRegistry:(file,registry)=>saveRegistry(file,registry,{database})};
}
