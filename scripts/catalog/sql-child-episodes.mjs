import { episodeInstant } from "../../resources/js/lib/episodeMetadata.mjs";

export class SqlChildEpisodes {
  constructor(db,identities) {
    this.ids=identities;
    this.season=db.prepare("SELECT * FROM catalog_seasons WHERE work_id=? AND number=?");
    this.seasonOwner=db.prepare("SELECT work_id,number FROM catalog_seasons WHERE id=?");
    this.addSeason=db.prepare("INSERT INTO catalog_seasons(id,work_id,number) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING");
    this.position=db.prepare("SELECT * FROM catalog_episodes WHERE work_id=? AND numbering_scheme='original' AND number=?");
    this.episode=db.prepare("SELECT * FROM catalog_episodes WHERE id=?");
    this.put=db.prepare("INSERT INTO catalog_episodes(id,work_id,season_id,numbering_scheme,number,air_date_utc,classification) VALUES(?,?,?,'original',?,?,?) ON CONFLICT(id) DO UPDATE SET season_id=excluded.season_id,number=excluded.number,air_date_utc=excluded.air_date_utc,classification=excluded.classification WHERE season_id IS NOT excluded.season_id OR number<>excluded.number OR air_date_utc IS NOT excluded.air_date_utc OR classification<>excluded.classification");
  }
  write(work,record,aliases) {
    if(!Number.isSafeInteger(record.number) || record.number<1) throw new Error("Invalid SQL episode number");
    let season=null;
    if(Number.isSafeInteger(record.tvdb_season) && record.tvdb_season>0) {
      const existing=this.season.get(work,record.tvdb_season);
      season=this.ids.claim("season",[`work:${work}:source-season:${record.tvdb_season}`],existing?.id);
      const owner=this.seasonOwner.get(season);
      if(owner && (owner.work_id!==work || owner.number!==record.tvdb_season)) throw new Error("Season cannot move to another SQL work or position");
      this.addSeason.run(season,work,record.tvdb_season);
    }
    const namespace=`anime:episode:work:${work}`, external=record.tvdb_episode_id ? String(record.tvdb_episode_id) : null;
    const mapped=external ? this.ids.external("tvdb",namespace,external) : null;
    const position=this.position.get(work,record.number);
    if(mapped && position && mapped!==position.id) throw new Error("Episode numbering conflicts with SQL provider identity");
    const names=[...new Set(aliases.flatMap(alias=>[`${alias}:ep-${record.number}`,`episode:${alias}:ep-${record.number}`]))];
    const id=this.ids.claim("episode",names,mapped || position?.id), existing=this.episode.get(id);
    if(existing && existing.work_id!==work) throw new Error("Episode cannot move to another SQL work");
    const classification=record.classification || "unknown";
    if(!["unknown","canon","filler","mixed"].includes(classification)) throw new Error("Invalid episode classification");
    const date=episodeInstant(record.air_date_utc)!==null ? new Date(record.air_date_utc).toISOString() : existing?.air_date_utc || null;
    this.put.run(id,work,season || existing?.season_id || null,record.number,date,classification==="unknown" ? existing?.classification || "unknown" : classification);
    if(external) this.ids.attach(id,"tvdb",namespace,external);
    this.ids.titles(id,record.titles);
    return id;
  }
}
