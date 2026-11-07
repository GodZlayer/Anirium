const relationKey=row=>JSON.stringify([row.from_work_id,row.to_work_id,row.relation_type,row.provider]);

export function planWorkRelations(db,rows,works) {
  const existing=new Set();
  for (const row of db.prepare("SELECT * FROM catalog_work_relations").iterate()) existing.add(relationKey(row));
  const plan=[];
  for (const work of rows) {
    const relations=JSON.parse(work.relations_v2_json || "[]");
    if (!Array.isArray(relations)) throw new Error("Invalid typed SQL relation document");
    for (const edge of relations) {
      const row={from_work_id:work.work_id,to_work_id:edge.target_work_id,relation_type:edge.relation_type,provider:edge.source};
      if (!works.has(row.from_work_id) || !works.has(row.to_work_id) || row.from_work_id===row.to_work_id
        || typeof row.relation_type!=="string" || !row.relation_type || row.relation_type.length>64
        || typeof row.provider!=="string" || !row.provider || row.provider.length>40) throw new Error("Invalid SQL work relation scope");
      const key=relationKey(row);
      if (!existing.has(key)) {plan.push(row);existing.add(key);}
    }
  }
  return plan;
}
