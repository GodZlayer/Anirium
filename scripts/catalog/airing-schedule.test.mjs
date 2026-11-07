import test from "node:test";
import assert from "node:assert/strict";
import { getLocalAiring, getAiringStatusLabel } from "../../resources/js/lib/airingSchedule.ts";
import { calendarCopy, calendarText, calendarWeekDays } from "../../resources/js/lib/calendarPresentation.mjs";
test("unknown broadcast times cannot be fabricated from a MAL ID or midday default", () => {
  assert.equal(getLocalAiring(null, null, new Date(), 11757), null);
  assert.equal(getLocalAiring("monday", null, new Date(), 11757), null);
  assert.equal(getLocalAiring("monday", "25:00", new Date(), 11757), null);
});
test("a documented UTC broadcast converts across the local day boundary", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Sao_Paulo";
  try {
    const airing = getLocalAiring("monday", "01:30", new Date("2026-10-21T12:00:00Z"));
    assert.equal(airing.dayIndex, 6);
    assert.equal(airing.time, "22:30");
    assert.equal(airing.minutes, 1350);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
test("a recurring scheduled time is not proof of a live or completed transmission", () => {
  const now = new Date(), day = (now.getDay() + 6) % 7;
  const label = getAiringStatusLabel({ dayIndex: day, time: "00:00", minutes: now.getHours() * 60 + now.getMinutes() }, day, now);
  assert.equal(label.includes("No Ar Agora"), false);
  assert.equal(label.includes("Transmitido"), false);
});

test("calendar locale changes preserve Monday-based day IDs and translate every schedule state", () => {
  const now = new Date(2026, 9, 25, 12, 0), day = (now.getDay() + 6) % 7;
  const expected = { "pt-BR": "segunda-feira", "en-US": "Monday", "ja-JP": "月曜日", "es-ES": "lunes", "fr-FR": "lundi", "de-DE": "Montag" };
  const keys = Object.keys(calendarCopy("pt-BR")).sort();
  for (const [language, monday] of Object.entries(expected)) {
    const days = calendarWeekDays(language), labels = calendarCopy(language);
    assert.deepEqual(days.map(day => day.id), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(days[0].full, monday);
    assert.deepEqual(Object.keys(labels).sort(), keys);
    assert.equal(labels.days.length, 7);
    assert.equal(labels.daysShort.length, 7);
    for (const key of keys) {
      if (typeof labels[key] !== "string") continue;
      const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
      assert.deepEqual(placeholders(labels[key]), placeholders(calendarCopy("pt-BR")[key]));
    }
    for (const [minutes, key] of [[600, "scheduled"], [720, "now"], [750, "inMinutes"], [900, "todayAt"]]) {
      const airing = { dayIndex: day, time: "12:30", minutes };
      const values = { time: airing.time, minutes: (minutes - 720).toLocaleString(language) };
      assert.equal(getAiringStatusLabel(airing, day, now, language), calendarText(language, key, values));
      assert.equal(getAiringStatusLabel(airing, (day + 1) % 7, now, language), calendarText(language, "at", values));
    }
  }
  assert.throws(() => calendarText("en-US", "count"), /Missing/);
  assert.throws(() => calendarText("en-US", "missing"), /Unknown/);
});
