import test from "node:test";
import assert from "node:assert/strict";
import { malBroadcastSchedule } from "../../resources/js/lib/broadcastSchedule.mjs";
import { malWorkRecord } from "./mal-work-record.mjs";
test("MAL Japan broadcast rolls back the weekday when converted to UTC", () => {
  const schedule = malBroadcastSchedule({ day_of_the_week: "monday", start_time: "01:30" });
  assert.equal(schedule.airing_day, "sunday");
  assert.equal(schedule.airing_time, "16:30");
  assert.equal(schedule.airing_timezone, "UTC");
  assert.equal(JSON.parse(schedule.broadcast_json).timezone, "Asia/Tokyo");
  const row = malWorkRecord({ id: 1, title: "Anime", broadcast: { day_of_the_week: "monday", start_time: "01:30" } }, "anime", "2026-10-21");
  assert.equal(row.airing_time, "16:30");
  const proof = JSON.parse(row.field_provenance_json);
  assert.equal(proof.evidence[proof.fields.airing_time].provider, "myanimelist");
});
test("unknown or invalid broadcast evidence never produces a weekly slot", () => {
  for (const data of [null, {}, { day_of_the_week: "other", start_time: "10:00" }, { day_of_the_week: "monday", start_time: "24:00" }]) assert.equal(malBroadcastSchedule(data), null);
});
