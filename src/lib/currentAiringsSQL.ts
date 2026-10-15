/** Shared current source assertions; $1 is the explicitly selected source. No time/availability filter. */
export const currentAiringsSQL = `
    WITH current_times AS (
      SELECT f.entity_id,f.alias_id,f.value_type,f.value,f.observed_at
      FROM canonical_content_fact_heads h JOIN canonical_content_facts f
        ON (f.entity_id,f.alias_id,f.source_key,f.field,f.observed_at)=(h.entity_id,h.alias_id,h.source_key,h.field,h.observed_at)
      WHERE h.source_key=$1 AND h.field='airing.scheduledAt'
    ), current_cancellations AS (
      SELECT f.entity_id,f.alias_id,f.value,f.observed_at
      FROM canonical_content_fact_heads h JOIN canonical_content_facts f
        ON (f.entity_id,f.alias_id,f.source_key,f.field,f.observed_at)=(h.entity_id,h.alias_id,h.source_key,h.field,h.observed_at)
      WHERE h.source_key=$1 AND h.field='airing.cancelled'
    ), events AS (
      SELECT t.entity_id,t.alias_id,t.observed_at,
        CASE WHEN t.value_type='instant' THEN (t.value::text)::bigint END AS scheduled_at,
        CASE WHEN c.observed_at>=t.observed_at THEN (c.value::text)::boolean END AS cancelled
      FROM current_times t LEFT JOIN current_cancellations c ON c.entity_id=t.entity_id AND c.alias_id=t.alias_id
    )
    SELECT ep.child_id AS "episodeId",ep.parent_id AS "seasonId",s.parent_id AS "workId",w.parent_id AS "universeId",
      ep.display_order AS "episodeNumber",a.id::text AS "aliasId",a.namespace,a.value AS "externalId",
      f.scheduled_at::double precision AS "scheduledAt",f.observed_at::double precision AS "observedAt",f.cancelled
    FROM events f JOIN canonical_aliases a ON a.id=f.alias_id AND a.state='active'
    JOIN canonical_memberships ep ON ep.child_id=f.entity_id AND ep.parent_kind='SEASON' AND ep.child_kind='EPISODE'
    JOIN canonical_memberships s ON s.child_id=ep.parent_id AND s.parent_kind='WORK'
    JOIN canonical_memberships w ON w.child_id=s.parent_id AND w.parent_kind='UNIVERSE'
    JOIN canonical_entities e ON e.id=ep.child_id AND e.visibility='public'
    JOIN canonical_entities se ON se.id=ep.parent_id AND se.visibility='public'
    JOIN canonical_entities wo ON wo.id=s.parent_id AND wo.visibility='public'
    JOIN canonical_entities u ON u.id=w.parent_id AND u.visibility='public'
`;
