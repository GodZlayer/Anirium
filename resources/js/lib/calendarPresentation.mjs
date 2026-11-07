import catalog from "../../data/calendar-labels.json" with { type: "json" };

export function calendarCopy(language) {
  return catalog[language] || catalog["pt-BR"];
}

export function calendarText(language, key, values = {}) {
  const template = calendarCopy(language)[key];
  if (typeof template !== "string") throw new Error("Unknown calendar string key");
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) throw new Error("Missing calendar string parameter");
    return String(values[name]);
  });
}

export function calendarWeekDays(language) {
  const labels = calendarCopy(language);
  return labels.days.map((full, id) => ({ id, label: labels.daysShort[id], full }));
}
