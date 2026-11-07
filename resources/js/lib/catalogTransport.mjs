import { catalogPreviewSelected } from "./catalogLocation.mjs";

export function catalogFetch(url, options) {
  const preview = catalogPreviewSelected();
  if (preview && typeof url === "string") {
    const previous = url;
    if (url === "/data/catalog.manifest.json") url = "/api/catalog/candidate/manifest";
    else if (url.startsWith("/data/catalog/v2/")) url = url.replace("/data/catalog/v2/", "/api/catalog/candidate/files/");
    else if (url.startsWith("/data/episodes/anime/")) url = url.replace("/data/episodes/anime/", "/api/catalog/candidate/episodes/");
    else if (/^\/api\/catalog\/(search|feed|work\/)/.test(url)) url = url.replace("/api/catalog/", "/api/catalog/candidate/");
    const candidate = new URLSearchParams(window.location.search).get("candidate");
    if (url !== previous && candidate !== null) url += (url.includes("?") ? "&" : "?") + new URLSearchParams({ candidate });
  }
  return fetch(url, options);
}
