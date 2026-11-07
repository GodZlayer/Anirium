import { eligibleFillerWork, validFillerRanges } from "./filler-identity.mjs";
import { fillerProvenance } from "./filler-provenance.mjs";

export function applyFillerSnapshot(rows, snapshot, provenance) {
  if (!Number.isFinite(Date.parse(snapshot?.generated)) || !snapshot.shows || Array.isArray(snapshot.shows)
    || typeof snapshot.shows !== "object" || !/^sha256:[a-f0-9]{64}$/.test(provenance?.digest || "")) throw new Error("Invalid filler snapshot metadata");
  const byId = new Map(rows.filter(row => !["MANGA", "NOVEL"].includes(row.entity_type)).map(row => [row.mal_id, row]));
  const report = { total: Object.keys(snapshot.shows).length, applied: 0, newerExisting: 0, rejected: [] };
  for (const [key, guide] of Object.entries(snapshot.shows)) {
    const id = Number(key), row = byId.get(id);
    if (!Number.isSafeInteger(id) || id < 1 || String(id) !== key || !row || !eligibleFillerWork(row)) { report.rejected.push({ id: key, reason: "ineligible-or-unknown-work" }); continue; }
    try {
      const url = new URL(guide.source);
      if (url.protocol !== "https:" || url.hostname !== "www.animefillerlist.com" || url.username || url.password
        || !/^\/shows\/[a-z0-9-]+$/i.test(url.pathname) || url.search || url.hash) throw new Error("invalid-source");
      const groups = Object.fromEntries(["canon", "filler", "mixed", "anime_canon"].map(name => [name, guide[name] ?? []]));
      const seen = new Set();
      for (const values of Object.values(groups)) {
        if (!Array.isArray(values)) throw new Error("invalid-category");
        for (const number of values) {
          if (!Number.isSafeInteger(number) || number < 1 || seen.has(number)) throw new Error("invalid-or-conflicting-episode");
          seen.add(number);
        }
      }
      if (!seen.size) throw new Error("empty-classification");
      const ranges = Object.fromEntries(Object.entries(groups).map(([name, values]) => [name, values.map(String)]));
      if (!validFillerRanges(row, ...Object.values(ranges))) throw new Error("out-of-bounds");
      let existing;
      try { existing = JSON.parse(row.filler_episodes_json || "null"); } catch {}
      if (Date.parse(existing?.checked_at) >= Date.parse(snapshot.generated)) { report.newerExisting++; continue; }
      row.filler_episodes_json = JSON.stringify({ ...ranges, mal_id: id, source: "animefillerlist", source_url: url.href,
        checked_at: snapshot.generated, via: fillerProvenance(provenance, snapshot) });
      report.applied++;
    } catch (error) { report.rejected.push({ id, reason: error.message }); }
  }
  return report;
}
