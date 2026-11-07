export class SqlChildArcs {
  constructor(db,identities) {
    this.ids=identities;
    this.arc=db.prepare("SELECT * FROM catalog_arcs WHERE id=?");
    this.membership=db.prepare("SELECT 1 FROM catalog_universe_works WHERE universe_id=? AND work_id=?");
    this.put=db.prepare("INSERT INTO catalog_arcs(id,universe_id,title,classification,source_url) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,classification=excluded.classification,source_url=excluded.source_url WHERE title<>excluded.title OR classification<>excluded.classification OR source_url IS NOT excluded.source_url");
    this.link=db.prepare("INSERT INTO catalog_arc_works(arc_id,work_id,universe_id,start_number,end_number) VALUES(?,?,?,?,?) ON CONFLICT(arc_id,work_id) DO UPDATE SET start_number=excluded.start_number,end_number=excluded.end_number WHERE start_number IS NOT excluded.start_number OR end_number IS NOT excluded.end_number");
    this.episodes=db.prepare("SELECT id FROM catalog_episodes WHERE work_id=? AND numbering_scheme='original' AND number BETWEEN ? AND ?");
    this.unlinkOutside=db.prepare("DELETE FROM catalog_arc_episodes WHERE arc_id=? AND work_id=? AND episode_id NOT IN (SELECT id FROM catalog_episodes WHERE work_id=? AND numbering_scheme='original' AND number BETWEEN ? AND ?)");
    this.member=db.prepare("INSERT INTO catalog_arc_episodes(arc_id,episode_id,universe_id,work_id) VALUES(?,?,?,?) ON CONFLICT(arc_id,episode_id) DO NOTHING");
  }
  write(work,universes,record) {
    if(typeof record.arcId!=="string" || !record.arcId || typeof record.name!=="string" || !record.name.trim()
      || !Number.isSafeInteger(record.startEp) || !Number.isSafeInteger(record.endEp) || record.startEp<1 || record.endEp<record.startEp
      || !["unknown","canon","filler","mixed"].includes(record.classification || "unknown")) throw new Error("Invalid sourced SQL arc");
    const alias=`work:${work}:source-arc:${record.arcId}`, retained=this.ids.alias.get("arc",alias)?.entity_id;
    const previous=retained ? this.arc.get(retained) : null;
    const universe=previous?.universe_id || (universes.length===1 ? universes[0] : null);
    if(!universe || !universes.includes(universe) || !this.membership.get(universe,work)) throw new Error("Arc requires a proved SQL universe scope");
    const id=this.ids.claim("arc",[alias],retained);
    this.put.run(id,universe,record.name,record.classification || "unknown",record.source_url);
    this.link.run(id,work,universe,record.startEp,record.endEp);
    this.unlinkOutside.run(id,work,work,record.startEp,record.endEp);
    for(const episode of this.episodes.iterate(work,record.startEp,record.endEp)) this.member.run(id,episode.id,universe,work);
    return id;
  }
}
