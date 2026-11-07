import { assignIdentity } from "./assign-identities.mjs";
import { externalKey } from "./external-identity.mjs";
import { readFieldProvenance } from "./field-provenance.mjs";
import { preferIncomingField, mergeRawRelations } from "./field-policy.mjs";
import { retainWrittenKind } from "./written-kind-reconciliation.mjs";

export function createConsolidator(existing, registry, { onFieldConflict = () => {}, migrateExisting = true } = {}) {
  const works = new Map(), report = { migrated: 0, inserted: 0, supplemented: 0, fieldConflicts: 0, conflicts: [] };
  for (const row of existing) {
    const identified = migrateExisting ? assignIdentity(row, registry) : row;
    if (!identified.work_id || !registry.works[identified.work_id]) throw new Error("Existing work missing from registry");
    works.set(identified.work_id, identified); report.migrated++;
  }
  const add = row => {
    try {
      const refs = JSON.parse(row.external_ids_json || "[]");
      const known = new Set(refs.map(ref => registry.references[externalKey(ref)]).filter(Boolean));
      if (known.size > 1) throw new Error("Conflicting established work identities");
      const retained = works.get([...known][0]), adjusted = retainWrittenKind(row, retained);
      if (adjusted !== row) {
        report.fieldConflicts++;
        onFieldConflict({ work_id: retained.work_id, field: "entity_type", retained: retained.entity_type, incoming: row.entity_type,
          retainedEvidence: { provider: retained.metadata_source || "unverified-legacy" },
          incomingEvidence: { provider: row.metadata_source || "unknown", references: refs } });
        row = adjusted;
      }
      const identified = assignIdentity(row, registry);
      const existingRow = works.get(identified.work_id);
      if (!existingRow) { works.set(identified.work_id, identified); report.inserted++; return; }
      const merged = { ...existingRow, entity_type: identified.entity_type, id: identified.id, catalog_key: identified.catalog_key, mal_id: identified.mal_id ?? existingRow.mal_id ?? null, external_ids_json: identified.external_ids_json, aliases_json: identified.aliases_json };
      const provenance = readFieldProvenance(existingRow.field_provenance_json);
      const evidence = readFieldProvenance(row.field_provenance_json);
      for (const [key, value] of Object.entries(row)) {
        if (["id", "work_id", "catalog_key", "entity_type", "field_provenance_json", "external_ids_json", "aliases_json"].includes(key)) continue;
        const currentEvidence = provenance.evidence[provenance.fields[key]] || (existingRow.metadata_source ? { provider: existingRow.metadata_source, observed_at: existingRow.metadata_checked_at } : null);
        const incomingEvidence = evidence.evidence[evidence.fields[key]];
        if (key === "source_relations_json") { merged[key] = mergeRawRelations(merged[key], value); continue; }
        const newer = preferIncomingField(currentEvidence, incomingEvidence);
        if (merged[key] != null && merged[key] !== "" && value != null && value !== "" && merged[key] !== value && !newer) {
          report.fieldConflicts++;
          onFieldConflict({ work_id: identified.work_id, field: key, retained: merged[key], incoming: value,
            retainedEvidence: currentEvidence || null, incomingEvidence: incomingEvidence || null });
        }
        if ((merged[key] == null || merged[key] === "" || newer) && value != null && value !== "") {
          merged[key] = value;
          const ref = evidence.fields[key];
          if (ref && evidence.evidence[ref]) { provenance.fields[key] = ref; provenance.evidence[ref] = evidence.evidence[ref]; }
        }
      }
      merged.field_provenance_json = JSON.stringify(provenance);
      works.set(identified.work_id, merged); report.supplemented++;
    } catch (error) { report.conflicts.push({ title: row.title, reason: error.message, entity_type: row.entity_type || "WORK",
      references: row.external_ids_json || "[]", work_id: row.work_id || null }); }
  };
  return { add, finish: () => ({ rows: [...works.values()], report }) };
}

export function consolidateSnapshot(existing, incoming, registry) {
  const consolidator = createConsolidator(existing, registry);
  for (const row of incoming) consolidator.add(row);
  return consolidator.finish();
}
