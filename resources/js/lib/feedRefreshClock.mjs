export function feedRefreshDelay(nextRelease, now = Date.now()) {
  const next = typeof nextRelease === "string" ? Date.parse(nextRelease) : NaN;
  return Number.isFinite(next) && next > now ? Math.min(30000, next - now + 25) : 30000;
}
