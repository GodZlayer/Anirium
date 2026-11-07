import { createHash } from "node:crypto";

export function fieldProvenance(row, evidence) {
  const key = createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 24);
  return JSON.stringify({ evidence: { [key]: evidence }, fields: Object.fromEntries(Object.keys(row)
    .filter(field => row[field] != null).map(field => [field, key])) });
}

export function readFieldProvenance(value) {
  const parsed = JSON.parse(value || "{}");
  if (parsed.fields && parsed.evidence) return parsed;
  return { fields: {}, evidence: {} };
}

export function attachFieldEvidence(row, fields, evidence) {
  const provenance = readFieldProvenance(row.field_provenance_json);
  const key = createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 24);
  for (const field of fields) {
    if (row[field] == null) continue;
    const previous = provenance.evidence[provenance.fields[field]];
    if (previous?.provider === evidence.provider && previous.source_url === evidence.source_url && previous.observed_at === evidence.observed_at) continue;
    provenance.fields[field] = key; provenance.evidence[key] = evidence;
  }
  const selected = new Set(Object.values(provenance.fields));
  provenance.evidence = Object.fromEntries(Object.entries(provenance.evidence).filter(([id]) => selected.has(id)));
  row.field_provenance_json = JSON.stringify(provenance);
}
