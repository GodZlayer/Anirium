import { catalogAliases, catalogKey, referenceKey } from "./catalogIdentity.mjs";

export function libraryReference(value) {
  const text = String(value);
  return referenceKey(text) || (text.startsWith("work:") ? referenceKey(text.slice(5)) : null);
}

export function libraryMatches(work, values) {
  const aliases = new Set([catalogKey(work), ...catalogAliases(work)]);
  return values.some(value => value === work.id || aliases.has(libraryReference(value)));
}

export function libraryRating(work, ratings) {
  const aliases = new Set([catalogKey(work), ...catalogAliases(work)]);
  for (const [reference, rating] of Object.entries(ratings)) {
    if (aliases.has(libraryReference(reference)) && Number.isFinite(Number(rating))) return Number(rating);
  }
  return undefined;
}

export function libraryPreferences(preferences) {
  const bookmarks = [], completed = [], ratings = {};
  const latest = new Map();
  for (const preference of preferences || []) {
    if (preference.target_type !== "work") continue;
    const reference = libraryReference(preference.entity_id || preference.target_id);
    if (!reference) continue;
    const prior = latest.get(reference);
    const time = Date.parse(preference.last_interacted_at || preference.updated_at) || 0;
    if (!prior || time >= prior.time) latest.set(reference, { preference, time });
  }
  for (const [reference, { preference }] of latest) {
    if (preference.bookmarked) bookmarks.push(reference);
    if (preference.status === "completed") completed.push(reference);
    if (preference.user_score != null && Number.isFinite(Number(preference.user_score))) ratings[reference] = Number(preference.user_score);
  }
  return { bookmarks: [...new Set(bookmarks)], completed: [...new Set(completed)], ratings };
}
