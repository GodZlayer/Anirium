import test from "node:test";
import assert from "node:assert/strict";
import catalog from "../../resources/data/achievement-catalog.json" with {type:"json"};
import { achievementLabel, resolveAchievementId, unlockedAchievementIds, selectAchievementId } from "../../resources/js/lib/achievementCatalog.mjs";

test("achievement identity survives language changes and only known historical labels resolve at entry",()=>{
  const id="achievement.episodes-100";
  assert.notEqual(achievementLabel(id,"pt-BR"),achievementLabel(id,"en-US"));
  for(const record of Object.values(catalog)) assert.deepEqual(Object.keys(record.labels).sort(),["pt-BR","en-US","ja-JP","es-ES","fr-FR","de-DE"].sort());
  for(const record of Object.values(catalog)) {
    assert.ok(["tier","level","episodes","universes"].includes(record.condition.field));
    assert.ok(["eq","gte"].includes(record.condition.operator));
    assert.ok(Number.isSafeInteger(record.condition.value) && record.condition.value>=0);
  }
  assert.equal(resolveAchievementId("Lenda Shonen"),id);assert.equal(resolveAchievementId(id),id);
  assert.equal(resolveAchievementId("An arbitrary title"),null);
});

test("a new episode revokes the master selection without changing achievement IDs",()=>{
  const before=unlockedAchievementIds({tier:2,level:5,episodes:30,universes:1});
  const after=unlockedAchievementIds({tier:2,level:5,episodes:30,universes:0});
  assert.equal(selectAchievementId(before,"achievement.universe-master"),"achievement.universe-master");
  assert.notEqual(selectAchievementId(after,"achievement.universe-master"),"achievement.universe-master");
  assert.ok(after.includes("achievement.plus"));assert.ok(!after.includes("achievement.admin"));
});
