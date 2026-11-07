export function malDate(value) {
  if (typeof value !== "string" || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || (month != null && (month < 1 || month > 12))) return null;
  if (day != null) {
    const parsed = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) return null;
  }
  return value;
}

export function malDatePatch(record) {
  return Object.fromEntries(["start_date", "end_date"].filter(key => Object.hasOwn(record, key))
    .map(key => [key, malDate(record[key])]));
}
