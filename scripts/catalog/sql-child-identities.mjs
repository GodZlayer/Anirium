import { randomUUID } from "node:crypto";

export class SqlChildIdentities {
  constructor(db) {
    this.db=db;
    this.kind=db.prepare("SELECT kind FROM catalog_entities WHERE id=?");
    this.alias=db.prepare("SELECT entity_id FROM catalog_entity_aliases WHERE kind=? AND alias=?");
    this.addAlias=db.prepare("INSERT INTO catalog_entity_aliases(kind,alias,entity_id) VALUES(?,?,?) ON CONFLICT(kind,alias) DO NOTHING");
    this.add=db.prepare("INSERT INTO catalog_entities(id,kind,resolution_status,created_at,updated_at) VALUES(?,?,'verified',?,?)");
    this.ref=db.prepare("SELECT entity_id FROM catalog_external_identities WHERE provider=? AND namespace=? AND external_id=?");
    this.addRef=db.prepare("INSERT INTO catalog_external_identities(provider,namespace,external_id,entity_id) VALUES(?,?,?,?) ON CONFLICT(provider,namespace,external_id) DO NOTHING");
    this.setTitle=db.prepare("INSERT INTO catalog_entity_titles(entity_id,locale,title) VALUES(?,?,?) ON CONFLICT(entity_id,locale) DO UPDATE SET title=excluded.title WHERE title<>excluded.title");
  }
  claim(kind,aliases,preferred) {
    const matches=new Set(aliases.map(value=>this.alias.get(kind,value)?.entity_id).filter(Boolean));
    if(preferred) matches.add(preferred);
    if(matches.size>1) throw new Error("Conflicting established SQL child identities");
    const id=[...matches][0] || randomUUID(), existing=this.kind.get(id);
    if(existing && existing.kind!==kind) throw new Error("SQL child UUID belongs to another entity kind");
    if(!existing) {const now=new Date().toISOString();this.add.run(id,kind,now,now);}
    for(const value of aliases) {
      if(!value || value.length>200) throw new Error("Invalid SQL child alias");
      this.addAlias.run(kind,value,id);
      if(this.alias.get(kind,value)?.entity_id!==id) throw new Error("SQL child alias owner changed");
    }
    return id;
  }
  external(provider,namespace,id) {return this.ref.get(provider,namespace,id)?.entity_id;}
  attach(id,provider,namespace,value) {
    this.addRef.run(provider,namespace,value,id);
    if(this.external(provider,namespace,value)!==id) throw new Error("SQL child provider identity conflict");
  }
  titles(id,titles) {
    for(const [locale,title] of Object.entries(titles || {})) {
      if(!locale || locale.length>16 || typeof title!=="string") throw new Error("Invalid SQL child title");
      if(title.trim()) this.setTitle.run(id,locale,title);
    }
  }
}
