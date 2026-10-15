// Prepare pre-cutover discussion records only in disposable integration databases.
export function historicalCommentFixture({database,identity,coordinates}) {
  return async (owner,input) => database.withTransaction(async client=>{
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner]);
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
    const canonicalId=await identity.resolveCommentEntity(client,input.entityType,input.entityId);
    const old=coordinates.catalogEntityCoordinates(input.entityType,input.entityId);
    const release=input.entityType==='SERIES' && old
      ? (await client.query('SELECT composition_season_id FROM anime_catalog WHERE mal_id=$1',[old.parentSeriesId])).rows[0]?.composition_season_id : null;
    return (await client.query(`INSERT INTO entity_comments(user_id,entity_type,entity_id,parent_series_id,episode_number,parent_comment_id,content,is_spoiler,canonical_entity_id,release_entity_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,created_at,canonical_entity_id`,
      [owner,input.entityType,input.entityId,input.parentSeriesId??old?.parentSeriesId??null,input.episodeNumber??old?.episodeNumber??null,input.parentCommentId??null,input.content,input.isSpoiler??false,canonicalId,release??null])).rows[0];
  });
}
