import { readSqlRegistry } from "./sql-registry-read.mjs";
import { externalKey } from "./external-identity.mjs";
import { validateRegistry } from "./work-registry.mjs";
import { assertRegistryPreserved } from "./sql-registry-preservation.mjs";

// Adopt only metadata after the graph import. Never allocate or move an ID from JSON.
export function adoptRegistryMetadata(db, legacy) {
  validateRegistry(legacy);
  db.exec("BEGIN IMMEDIATE");
  try {
    const current=readSqlRegistry(db), next=structuredClone(current);
    if (Object.keys(current.works).length!==Object.keys(legacy.works).length) throw new Error("Registry adoption requires the complete SQL work set");
    for (const [id,value] of Object.entries(legacy.works)) {
      const target=next.works[id];
      if (!target || target.entity_type!==value.entity_type) throw new Error("Legacy work differs from imported SQL identity");
      for (const ref of value.references) {
        if (current.references[externalKey(ref)]!==id) throw new Error("Legacy reference differs from imported SQL identity");
      }
      for (const alias of value.aliases) {
        if (alias!==`work:${id}` && current.aliases[alias]!==id) throw new Error("Legacy alias differs from imported SQL identity");
      }
      target.account_reference=value.account_reference || target.account_reference;
      if (value.media_history?.length) target.media_history=value.media_history;
    }
    next.source_redirects={...current.source_redirects,...legacy.source_redirects};
    next.source_redirect_evidence={...current.source_redirect_evidence,...legacy.source_redirect_evidence};
    validateRegistry(next); assertRegistryPreserved(current,next);
    const insert=db.prepare("INSERT INTO catalog_registry_metadata(entity_id,account_reference,media_history) VALUES(?,?,?) ON CONFLICT(entity_id) DO UPDATE SET account_reference=excluded.account_reference,media_history=excluded.media_history");
    for (const [id,value] of Object.entries(next.works)) insert.run(id,value.account_reference,value.media_history?.length ? JSON.stringify(value.media_history) : null);
    const redirect=db.prepare("INSERT INTO catalog_source_redirects VALUES(?,?,?,?) ON CONFLICT(from_reference) DO UPDATE SET to_reference=excluded.to_reference,evidence_key=excluded.evidence_key,evidence_json=excluded.evidence_json");
    for (const [key,value] of Object.entries(next.source_redirects)) redirect.run(key,value.to,value.evidence,JSON.stringify(next.source_redirect_evidence[value.evidence]));
    db.exec("COMMIT");
    return {works:Object.keys(next.works).length,redirects:Object.keys(next.source_redirects).length};
  } catch(error) { db.exec("ROLLBACK"); throw error; }
}
