// Test-only preparation of encrypted pre-cutover rows. Never imported by src.
export function historicalActivityFixture({database, activity, privateData, activityIndex}) {
  return async (owner,type,id,metadata={},patch={}) => database.withTransaction(async client => {
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner]);
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('anirium:catalog:hierarchy',0))");
    const context=activity.activityContext({user_id:owner,entity_type:type,entity_id:id});
    const initial={watched_seconds:0,total_seconds:0,user_score:null,external_source_score:null,user_opinion:null,audio_track_used:null,subtitle_track_used:null};
    await client.query(`INSERT INTO user_entity_status(user_id,entity_type,entity_id,parent_series_id,season_idx,episode_number,status,activity_private)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,entity_type,entity_id) DO NOTHING`,
      [owner,type,id,metadata.parentSeriesId??null,metadata.seasonIdx??null,metadata.episodeNumber??null,metadata.status??'watching',JSON.stringify(privateData.encryptPrivateJson(initial,context))]);
    const row=(await client.query('SELECT * FROM user_entity_status WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3 FOR UPDATE',[owner,type,id])).rows[0];
    const payload={...activity.readActivity(row),...patch};
    const envelope=privateData.encryptPrivateJson(payload,activity.activityContext(row));
    await client.query(`UPDATE user_entity_status SET activity_private=$4,status=COALESCE($5,status),completed=COALESCE($6,completed),contains_spoilers=COALESCE($7,contains_spoilers)
      WHERE user_id=$1 AND entity_type=$2 AND entity_id=$3`,[owner,type,id,JSON.stringify(envelope),metadata.status??null,metadata.completed??null,metadata.containsSpoilers??null]);
    await activityIndex.bindActivityEntity(client,owner,type,id);
  });
}
