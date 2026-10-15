// Distributor links are navigation destinations, not guarantees of episode
// availability or regional licensing. Unknown destinations fail closed.
const distributorDomains = [
  'crunchyroll.com', 'netflix.com', 'hulu.com', 'primevideo.com',
  'disneyplus.com', 'hidive.com', 'tubi.tv', 'pluto.tv',
];

export function filterOfficialStreamingLinks<T extends { url?: string; type?: string }>(links?: T[]): T[] {
  if (!Array.isArray(links)) return [];
  return links.filter(link => {
    if (!link || typeof link.url !== 'string' || link.type === 'INFO' || link.type === 'SOCIAL') return false;
    try {
      const url = new URL(link.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
      if (url.pathname.toLowerCase().includes('/search') || url.searchParams.has('q')) return false;
      return distributorDomains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    } catch { return false; }
  });
}
