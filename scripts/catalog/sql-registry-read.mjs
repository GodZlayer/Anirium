import { emptyRegistry, validateRegistry } from "./work-registry.mjs";
import { externalKey } from "./external-identity.mjs";
import { validCatalogAlias } from "../../resources/js/lib/catalogAliases.mjs";
import { READ_PAGE_SIZE, forEachKeysetPage } from "./sql-registry-connection.mjs";

const WORK_NAMESPACES = new Set(["anime:work", "manga:work", "novel:work"]);

export function readSqlRegistry(db) {
  const registry = emptyRegistry();
  forEachKeysetPage(
    db,
    `SELECT w.rowid AS _cursor,w.id,w.media,w.title,e.kind,e.created_at,m.account_reference,m.media_history
      FROM catalog_works w JOIN catalog_entities e ON e.id=w.id LEFT JOIN catalog_registry_metadata m ON m.entity_id=w.id
      ORDER BY w.rowid LIMIT ${READ_PAGE_SIZE}`,
    `SELECT w.rowid AS _cursor,w.id,w.media,w.title,e.kind,e.created_at,m.account_reference,m.media_history
      FROM catalog_works w JOIN catalog_entities e ON e.id=w.id LEFT JOIN catalog_registry_metadata m ON m.entity_id=w.id
      WHERE w.rowid>? ORDER BY w.rowid LIMIT ${READ_PAGE_SIZE}`,
    "_cursor",
    row => {
      if (row.kind !== "work" || !["anime", "manga", "novel"].includes(row.media)) throw new Error("Invalid SQL work identity");
      const history = row.media_history ? JSON.parse(row.media_history) : [];
      registry.works[row.id] = { entity_type: {anime:"WORK",manga:"MANGA",novel:"NOVEL"}[row.media], references: [], aliases: [],
        title:row.title, createdAt:row.created_at, ...(row.account_reference ? {account_reference:row.account_reference} : {}),
        ...(history.length ? {media_history:history} : {}) };
    }
  );
  forEachKeysetPage(
    db,
    `SELECT rowid AS _cursor,provider,namespace,external_id,entity_id FROM catalog_external_identities ORDER BY rowid LIMIT ${READ_PAGE_SIZE}`,
    `SELECT rowid AS _cursor,provider,namespace,external_id,entity_id FROM catalog_external_identities WHERE rowid>? ORDER BY rowid LIMIT ${READ_PAGE_SIZE}`,
    "_cursor",
    row => {
      if (!WORK_NAMESPACES.has(row.namespace)) return;
      const work = registry.works[row.entity_id];
      if (!work) throw new Error("Orphan SQL work reference");
      const ref = {provider:row.provider,media:row.namespace.split(":")[0],id:row.external_id};
      work.references.push(ref); registry.references[externalKey(ref)] = row.entity_id;
    }
  );
  forEachKeysetPage(
    db,
    `SELECT alias,entity_id FROM catalog_entity_aliases WHERE kind='work' ORDER BY alias LIMIT ${READ_PAGE_SIZE}`,
    `SELECT alias,entity_id FROM catalog_entity_aliases WHERE kind='work' AND alias>? ORDER BY alias LIMIT ${READ_PAGE_SIZE}`,
    "alias",
    row => {
      if (!validCatalogAlias(row.alias)) return; // Historical URL aliases remain in SQL at the entry boundary.
      const work = registry.works[row.entity_id];
      if (!work) throw new Error("Orphan SQL work alias");
      work.aliases.push(row.alias); registry.aliases[row.alias] = row.entity_id;
    }
  );
  for (const [id,work] of Object.entries(registry.works)) {
    const alias = work.aliases.find(value => /^(anime|manga|novel):/.test(value));
    work.account_reference ||= alias?.startsWith("anime:") ? alias.slice(6) : alias || `work:${id}`;
  }
  forEachKeysetPage(
    db,
    `SELECT rowid AS _cursor,* FROM catalog_source_redirects ORDER BY rowid LIMIT ${READ_PAGE_SIZE}`,
    `SELECT rowid AS _cursor,* FROM catalog_source_redirects WHERE rowid>? ORDER BY rowid LIMIT ${READ_PAGE_SIZE}`,
    "_cursor",
    row => {
      registry.source_redirects ||= {}; registry.source_redirect_evidence ||= {};
      registry.source_redirects[row.from_reference] = {to:row.to_reference,evidence:row.evidence_key};
      const evidence = JSON.parse(row.evidence_json), previous = registry.source_redirect_evidence[row.evidence_key];
      if (previous && JSON.stringify(previous) !== JSON.stringify(evidence)) throw new Error("Conflicting SQL redirect evidence");
      registry.source_redirect_evidence[row.evidence_key] = evidence;
    }
  );
  return validateRegistry(registry);
}
