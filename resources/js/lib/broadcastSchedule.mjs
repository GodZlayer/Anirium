const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function malBroadcastSchedule(broadcast) {
  const day = DAYS.indexOf(broadcast?.day_of_the_week);
  const time = /^(\d{2}):(\d{2})$/.exec(broadcast?.start_time || "");
  if (day < 0 || !time || Number(time[1]) > 23 || Number(time[2]) > 59) return null;
  // MAL documents Japan local time; Japan uses UTC+09 without daylight saving.
  const instant = new Date(Date.UTC(2024, 0, 7 + day, Number(time[1]) - 9, Number(time[2])));
  return { airing_day: DAYS[instant.getUTCDay()], airing_time: instant.toISOString().slice(11, 16), airing_timezone: "UTC",
    broadcast_json: JSON.stringify({ ...broadcast, timezone: "Asia/Tokyo" }) };
}
