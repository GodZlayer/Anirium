export function discussionComment(row, language = "pt-BR") {
  if (!Number.isSafeInteger(row?.id) || row.id < 1 || typeof row.comment_body !== "string" || !Number.isFinite(Date.parse(row.created_at))) throw new Error("Invalid discussion record");
  return { id: `srv_${row.id}`, author: row.user_name || "—", avatar: row.user_avatar || undefined,
    content: row.comment_body, isSpoiler: Boolean(row.contains_spoilers), timestamp: new Date(row.created_at).toLocaleDateString(language) };
}

export async function readDiscussion(type, reference, { request = fetch, signal, language } = {}) {
  const response = await request(`/api/entity/comments/${encodeURIComponent(type)}/${encodeURIComponent(reference)}`, { signal, cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Discussion HTTP ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result.comments)) throw new Error("Invalid discussion response");
  return result.comments.map(row => discussionComment(row, language));
}

export async function postDiscussion(type, reference, text, spoiler, { request = fetch, language } = {}) {
  const response = await request("/api/entity/comments", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
    body: JSON.stringify({ target_type: type, target_id: reference, comment_body: text, contains_spoilers: spoiler }) });
  if (!response.ok) throw new Error(`Discussion HTTP ${response.status}`);
  return discussionComment((await response.json()).comment, language);
}
