import { ApiInputError } from "./apiInput";

export function readEntityPageInput(params: URLSearchParams, reason = "invalid_status_page", scope?: readonly [string, string]) {
  const fail = () => { throw new ApiInputError(400, reason); };
  for (const key of ["entity_type", "cursor", "limit"]) if (params.getAll(key).length > 1) fail();
  const entityType = params.get("entity_type");
  if (entityType !== null && !["UNIVERSE", "ARC", "SERIES", "SEASON", "EPISODE"].includes(entityType)) fail();
  const size = params.get("limit");
  if (size !== null && (!/^[1-9][0-9]?$/.test(size) || Number(size) > 20)) fail();
  let time: string | null = null, id: string | null = null;
  const cursor = params.get("cursor");
  if (cursor !== null) {
    try {
      if (!(scope ? /^[A-Za-z0-9_-]{1,1024}$/ : /^[A-Za-z0-9_-]{1,256}$/).test(cursor)) fail();
      const bytes = Buffer.from(cursor, "base64url");
      if (bytes.toString("base64url") !== cursor) fail();
      const tuple = JSON.parse(bytes.toString("utf8"));
      if (!Array.isArray(tuple) || tuple.length !== (scope ? 4 : 2) || typeof tuple[0] !== "string" || typeof tuple[1] !== "string") fail();
      if (scope && (tuple[2] !== scope[0] || tuple[3] !== scope[1])) fail();
      if (!/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/.test(tuple[0]) ||
          new Date(tuple[0]).toISOString().slice(0,23) !== tuple[0].slice(0,23) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tuple[1])) fail();
      [time,id] = tuple;
    } catch { fail(); }
  }
  return { entityType, limit: size === null ? 4 : Number(size), time, id };
}

