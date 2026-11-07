import test from "node:test";
import assert from "node:assert/strict";
import { malDate, malDatePatch } from "./mal-dates.mjs";

test("MAL dates retain their original precision without manufacturing a day or month", () => {
  for (const value of ["2012", "2012-07", "2012-07-08", "2024-02-29"]) assert.equal(malDate(value), value);
  for (const value of ["2023-02-29", "2012-13", "2012-00", "2012-07-32", "unknown", null]) assert.equal(malDate(value), null);
  assert.deepEqual(malDatePatch({ start_date: "2012-07-08" }), { start_date: "2012-07-08" });
  assert.deepEqual(malDatePatch({ title: "No date supplied" }), {});
});
