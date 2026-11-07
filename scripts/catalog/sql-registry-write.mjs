import { readSqlRegistry } from "./sql-registry-read.mjs";
import { assertRegistryPreserved } from "./sql-registry-preservation.mjs";
import { planRegistryWrites, registryMedia } from "./sql-registry-plan.mjs";

export function writeSqlRegistry(db, registry) {
  let plan;
  db.exec("BEGIN");
  try {
    const previous=readSqlRegistry(db);
    assertRegistryPreserved(previous,registry);
    plan=planRegistryWrites(db,previous,registry);
    db.exec("COMMIT");
  } catch(error) {db.exec("ROLLBACK");throw error;}
  const owner=db.prepare("SELECT e.kind,w.media,m.media_history FROM catalog_entities e LEFT JOIN catalog_works w ON w.id=e.id LEFT JOIN catalog_registry_metadata m ON m.entity_id=e.id WHERE e.id=?");
  const entity=db.prepare("INSERT INTO catalog_entities(id,kind,resolution_status,created_at,updated_at) VALUES(?,'work','verified',?,?) ON CONFLICT(id) DO NOTHING");
  const work=db.prepare("INSERT INTO catalog_works(id,media,title) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET media=excluded.media,title=excluded.title");
  const reference=db.prepare("INSERT INTO catalog_external_identities(provider,namespace,external_id,entity_id) VALUES(?,?,?,?) ON CONFLICT(provider,namespace,external_id) DO NOTHING");
  const referenceOwner=db.prepare("SELECT entity_id FROM catalog_external_identities WHERE provider=? AND namespace=? AND external_id=?");
  const alias=db.prepare("INSERT INTO catalog_entity_aliases(kind,alias,entity_id) VALUES('work',?,?) ON CONFLICT(kind,alias) DO NOTHING");
  const aliasOwner=db.prepare("SELECT entity_id FROM catalog_entity_aliases WHERE kind='work' AND alias=?");
  const metadata=db.prepare("INSERT INTO catalog_registry_metadata(entity_id,account_reference,media_history) VALUES(?,?,?) ON CONFLICT(entity_id) DO UPDATE SET account_reference=excluded.account_reference,media_history=excluded.media_history");
  let batches=0;
  const commit = (rows,apply) => {
    for (let offset=0;offset<rows.length;offset+=250) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const row of rows.slice(offset,offset+250)) apply(row);
        db.exec("COMMIT"); batches++;
      } catch(error) {db.exec("ROLLBACK");throw error;}
    }
  };
  commit(plan.works,({id,value,before,fields,meta,references,aliases})=>{
    const current=owner.get(id), media=registryMedia(value.entity_type);
    if (current && current.kind!=="work") throw new Error("SQL UUID belongs to another entity type");
    if (current?.media && current.media!==media && current.media!==registryMedia(before?.entity_type)) throw new Error("SQL work media changed during registry commit");
    for (const change of JSON.parse(current?.media_history || "[]")) {
      if (!value.media_history?.some(item=>JSON.stringify(item)===JSON.stringify(change))) throw new Error("Cannot discard SQL media evidence");
    }
    if (fields) {
      const now=new Date().toISOString();
      entity.run(id,value.createdAt || now,now);
      work.run(id,media,value.title);
    }
    for (const ref of references) {
      const namespace=ref.media+":work", inserted=reference.run(ref.provider,namespace,ref.id,id);
      if (!inserted.changes && referenceOwner.get(ref.provider,namespace,ref.id)?.entity_id!==id) throw new Error("SQL reference owner changed during registry commit");
    }
    for (const name of aliases) {
      const inserted=alias.run(name,id);
      if (!inserted.changes && aliasOwner.get(name)?.entity_id!==id) throw new Error("SQL alias owner changed during registry commit");
    }
    if (meta) metadata.run(id,value.account_reference,value.media_history?.length ? JSON.stringify(value.media_history) : null);
  });
  const redirect=db.prepare("INSERT INTO catalog_source_redirects VALUES(?,?,?,?) ON CONFLICT(from_reference) DO UPDATE SET to_reference=excluded.to_reference,evidence_key=excluded.evidence_key,evidence_json=excluded.evidence_json");
  commit(plan.redirects,({key,value,evidence})=>redirect.run(key,value.to,value.evidence,JSON.stringify(evidence)));
  return {worksChanged:plan.works.length,redirectsChanged:plan.redirects.length,batches};
}
