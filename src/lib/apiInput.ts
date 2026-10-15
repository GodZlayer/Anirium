export class ApiInputError extends Error {
  constructor(public readonly status: number, public readonly reason: string) {
    super(reason);
  }
  get publicMessage(): string | undefined {
    return this.reason === 'addon_install_limit'
      ? 'Limite de 50 extensões atingido. Remova uma extensão para instalar outra.'
      : undefined;
  }
}

export const MAX_API_JSON_BYTES = 64 * 1024;
export const API_JSON_READ_TIMEOUT_MS = 15000;

export function validateBookmarkInput(input: Record<string, any>) {
  if (input.animeId !== undefined) throw new ApiInputError(400,'invalid_bookmark');
  if (input.action === 'remove_bookmark') {
    validateCanonicalEntityStatusInput({entityType:input.entityType,entityId:input.entityId});
    return;
  }
  if (input.entityType === 'EPISODE') {
    const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
    if (input.entityId !== undefined || typeof input.seasonEntityId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.seasonEntityId) || !integer(input.parentSeriesId) || !integer(input.episodeNumber)) throw new ApiInputError(400,'invalid_bookmark_release');
    return;
  }
  if (input.seasonEntityId!==undefined && (input.entityType!=='SEASON' || input.seasonEntityId!==input.entityId)) throw new ApiInputError(400,'invalid_bookmark_release');
  if (input.entityType !== undefined || input.entityId !== undefined) {
    validateCanonicalEntityStatusInput({ entityType: input.entityType, entityId: input.entityId, parentSeriesId: input.parentSeriesId, seasonIdx: input.seasonIdx, episodeNumber: input.episodeNumber });
  } else {
    throw new ApiInputError(400, "invalid_bookmark");
  }
}
export function validateAddonToggleInput(input: Record<string, any>) {
  if (typeof input.addonId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.addonId) || typeof input.enabled !== "boolean") throw new ApiInputError(400, "invalid_addon_toggle");
}

export function validateProfileUpdateInput(input: Record<string, any>) {
  const fail = () => { throw new ApiInputError(400, "invalid_profile_update"); };
  if (input.displayName !== undefined && (typeof input.displayName !== "string" || !input.displayName.trim() || input.displayName.length > 100 || /[\u0000-\u001f\u007f]/.test(input.displayName))) fail();
  if (input.avatarUrl !== undefined) {
    const value = input.avatarUrl;
    if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) fail();
    if (value && !(value.startsWith("/") && !value.startsWith("//"))) {
      try { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) fail(); }
      catch { fail(); }
    }
  }
  if (input.settings !== undefined) {
    if (!input.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) fail();
    for (const [key,value] of Object.entries(input.settings)) {
      if (["autoNextEpisode", "autoSkipIntro", "telemetryHud", "usePlayerOnEpisodes"].includes(key)) {
        if (typeof value !== "boolean") fail();
      } else if (["theme", "preferredAudio", "preferredSubtitles"].includes(key)) {
        if (typeof value !== "string" || !value.trim() || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) fail();
      } else fail();
    }
  }
  return input;
}

export function validateCommentInput(input: Record<string, any>) {
  validateEntityStatusInput({ entityType: input.entityType, entityId: input.entityId, parentSeriesId: input.parentSeriesId, episodeNumber: input.episodeNumber });
  if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 4000 ||
      (input.isSpoiler != null && typeof input.isSpoiler !== "boolean") ||
      (input.parentCommentId != null && (typeof input.parentCommentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.parentCommentId)))) {
    throw new ApiInputError(400, "invalid_comment");
  }
  return input;
}

export function validateEntityStatusInput(input: Record<string, any>) {
  const fail = () => { throw new ApiInputError(400, "invalid_entity_status"); };
  if (!["UNIVERSE", "ARC", "SERIES", "SEASON", "EPISODE"].includes(input.entityType)) fail();
  if (typeof input.entityId !== "string" || !input.entityId.trim() || input.entityId.length > 100 || /[\u0000-\u001f\u007f]/.test(input.entityId)) fail();
  for (const [field, minimum] of [["parentSeriesId", 1], ["seasonIdx", 0], ["episodeNumber", 1]] as const) {
    const value = input[field];
    if (value != null && (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > 2147483647)) fail();
  }
  if (input.status != null && !["watching", "completed", "on_hold", "dropped", "plan_to_watch"].includes(input.status)) fail();
  for (const field of ["userScore", "externalScore"]) {
    const value = input[field];
    if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10)) fail();
  }
  if (input.userOpinion != null && (typeof input.userOpinion !== "string" || input.userOpinion.length > 16000)) fail();
  if (input.containsSpoilers != null && typeof input.containsSpoilers !== "boolean") fail();
  return input;
}

/** Current public entity contract. Source aliases are resolved during ingestion/migration. */
export function validateCanonicalEntityStatusInput(input: Record<string, any>) {
  validateEntityStatusInput(input);
  if (input.entityType==='ARC' && ['parentSeriesId','seasonIdx','episodeNumber'].some(field=>input[field]!=null)) throw new ApiInputError(400,'invalid_entity_status');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.entityId)) throw new ApiInputError(400,'invalid_entity_status');
  return input;
}

export function validateWatchProgressInput(input: Record<string, any>) {
  const { animeId, episode, progressSeconds, durationSeconds } = input;
  const seasonIdx = input.seasonIdx === undefined ? 0 : input.seasonIdx;
  const integer = (value: any, minimum: number) => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= 2147483647;
  const seconds = (value: any) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2147483647;
  if (!integer(animeId, 1) || !integer(seasonIdx, 0) || !integer(episode, 1) || !seconds(progressSeconds) || !seconds(durationSeconds)) {
    throw new ApiInputError(400, "invalid_watch_progress");
  }
  const seasonEntityId = input.seasonEntityId;
  if (typeof seasonEntityId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonEntityId)) throw new ApiInputError(400,"invalid_watch_progress");
  return { animeId, seasonIdx, episode, progressSeconds, durationSeconds, seasonEntityId };
}

function validateJsonStructure(root: Record<string, any>) {
  const pending: Array<{ value: any; depth: number }> = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 4096 || depth > 20) throw new ApiInputError(400, "json_structure_too_complex");
    if (typeof value === "number" && !Number.isFinite(value)) throw new ApiInputError(400, "invalid_json_number");
    if (value === null || typeof value !== "object") continue;
    const entries = Object.entries(value);
    if (entries.length > (Array.isArray(value) ? 1024 : 256)) throw new ApiInputError(400, "json_structure_too_complex");
    for (const [key, child] of entries) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new ApiInputError(400, "reserved_json_key");
      pending.push({ value: child, depth: depth + 1 });
    }
  }
}

// Count bytes while reading, rather than trusting Content-Length (which is
// absent on chunked requests). Do not retain or log rejected input.
export async function readApiJson(request: Request): Promise<Record<string, any>> {
  const type = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") throw new ApiInputError(415, "json_required");
  if (!request.body) throw new ApiInputError(400, "json_object_required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let rejectInterrupted!: (error: Error) => void;
  let interrupted = false;
  const interruption = new Promise<never>((_resolve, reject) => { rejectInterrupted = reject; });
  const stop = (error: ApiInputError) => {
    if (interrupted) return;
    interrupted = true;
    void reader.cancel().catch(() => {});
    rejectInterrupted(error);
  };
  const abort = () => stop(new ApiInputError(400, "request_aborted"));
  const deadline = setTimeout(() => stop(new ApiInputError(408, "request_body_timeout")), API_JSON_READ_TIMEOUT_MS);
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  try {
    await Promise.race([(async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (interrupted) return;
      if (done) break;
      size += value.byteLength;
      if (size > MAX_API_JSON_BYTES) {
        void reader.cancel().catch(() => {});
        throw new ApiInputError(413, "request_body_too_large");
      }
      chunks.push(value);
    }
    })(), interruption]);
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)); }
  catch { throw new ApiInputError(400, "invalid_json"); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiInputError(400, "json_object_required");
  }
  validateJsonStructure(body);
  return body;
}
