export function fillerProvenance(provenance, snapshot) {
  return {
    url: "https://github.com/cedya77/anime-offline-database/releases/download/fillers/fillers.json",
    digest: provenance.digest,
    checkedAt: provenance.checkedAt,
    observedAt: snapshot.generated,
    repository: "https://github.com/cedya77/anime-offline-database",
    repository_license: "ODbL-1.0 + DbCL-1.0",
    repository_attribution: ["cedya77/anime-offline-database", "manami-project/anime-offline-database"],
    upstream: { provider: "animefillerlist", source_url: "https://www.animefillerlist.com/", license: null, terms_verified: false },
  };
}
