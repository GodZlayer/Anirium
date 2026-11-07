export function parseAniListResponse(status, body) {
  if (status !== 200) throw new Error(`AniList HTTP ${status}`);
  const payload = JSON.parse(body);
  if (payload.errors?.length) throw new Error("AniList returned GraphQL errors");
  const page = payload.data?.Page;
  if (!page || !Array.isArray(page.media) || typeof page.pageInfo?.hasNextPage !== "boolean") {
    throw new Error("AniList returned an invalid catalog page");
  }
  return payload;
}

export function assertDiscoveryAvailable(...sources) {
  if (!sources.some(source => Array.isArray(source) && source.length > 0)) {
    throw new Error("No discovery source returned catalog records; existing snapshot preserved");
  }
}
