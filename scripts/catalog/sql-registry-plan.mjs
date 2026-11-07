import { externalKey } from "./external-identity.mjs";

export const registryMedia = value => ({WORK:"anime",MANGA:"manga",NOVEL:"novel"}[value]);

export function planRegistryWrites(db,previous,next) {
  const metadata=new Set(db.prepare("SELECT entity_id FROM catalog_registry_metadata").all().map(row=>row.entity_id));
  const works=[], redirects=[];
  for (const [id,value] of Object.entries(next.works)) {
    if (typeof value.title!=="string" || !value.title.trim()) throw new Error("SQL work title required");
    const before=previous.works[id];
    const fields=!before || value.title!==before.title || value.entity_type!==before.entity_type;
    const meta=!metadata.has(id) || value.account_reference!==before?.account_reference
      || JSON.stringify(value.media_history || [])!==JSON.stringify(before?.media_history || []);
    const references=value.references.filter(ref=>!previous.references[externalKey(ref)]);
    const aliases=value.aliases.filter(alias=>!previous.aliases[alias]);
    if (fields || meta || references.length || aliases.length) works.push({id,value,before,fields,meta,references,aliases});
  }
  for (const [key,value] of Object.entries(next.source_redirects || {})) {
    const before=previous.source_redirects?.[key];
    const evidence=next.source_redirect_evidence[value.evidence];
    if (value.to!==before?.to || value.evidence!==before?.evidence
      || JSON.stringify(evidence)!==JSON.stringify(previous.source_redirect_evidence?.[before?.evidence])) redirects.push({key,value,evidence});
  }
  return {works,redirects};
}
