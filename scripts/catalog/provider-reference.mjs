const PROVIDERS = {
  "myanimelist.net": ["mal", /^\/anime\/([1-9]\d*)$/], "anilist.co": ["anilist", /^\/anime\/([1-9]\d*)$/],
  "anidb.net": ["anidb", /^\/anime\/([1-9]\d*)$/], "kitsu.app": ["kitsu", /^\/anime\/([1-9]\d*)$/],
  "kitsu.io": ["kitsu", /^\/anime\/([1-9]\d*)$/], "anime-planet.com": ["anime-planet", /^\/anime\/([a-z0-9-]+)$/],
  "anisearch.com": ["anisearch", /^\/anime\/([1-9]\d*)$/], "livechart.me": ["livechart", /^\/anime\/([1-9]\d*)$/],
  "simkl.com": ["simkl", /^\/anime\/([1-9]\d*)$/], "animecountdown.com": ["animecountdown", /^\/([1-9]\d*)$/],
};

export function animeReference(value) {
  try {
    const url = new URL(value), host = url.hostname.replace(/^www\./, ""), descriptor = PROVIDERS[host];
    if (url.protocol === "https:" && !url.username && !url.password && !url.hash && host === "animenewsnetwork.com"
      && url.pathname === "/encyclopedia/anime.php" && [...url.searchParams.keys()].length === 1 && /^[1-9]\d*$/.test(url.searchParams.get("id") || "")) {
      return { provider: "animenewsnetwork", media: "anime", id: url.searchParams.get("id") };
    }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !descriptor) return null;
    const match = descriptor[1].exec(url.pathname);
    return match ? { provider: descriptor[0], media: "anime", id: match[1] } : null;
  } catch { return null; }
}
