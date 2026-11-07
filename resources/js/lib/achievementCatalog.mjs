import catalog from "../../data/achievement-catalog.json" with {type:"json"};

export function resolveAchievementId(value) {
  if(typeof value!=="string")return null;
  if(Object.hasOwn(catalog,value))return value;
  const matches=Object.entries(catalog).filter(([,record])=>Object.values(record.labels).includes(value));
  return matches.length===1?matches[0][0]:null;
}

export function unlockedAchievementIds(stats) {
  return Object.entries(catalog).filter(([,record])=>{
    const condition=record.condition, value=stats[condition.field];
    return Number.isFinite(value) && (condition.operator==="eq"?value===condition.value:condition.operator==="gte"&&value>=condition.value);
  }).map(([id])=>id);
}

export function selectAchievementId(unlocked,selected) {
  const id=resolveAchievementId(selected);
  return id && unlocked.includes(id)?id:unlocked[0] || "achievement.guest";
}

export function achievementLabel(id,language) {
  return catalog[id]?.labels[language] || catalog[id]?.labels["pt-BR"] || "";
}
