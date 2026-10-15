export function catalogSeriesId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}
export function catalogEntityCoordinates(type: string, id: string): Record<string, number> | null {
  if (type === "SERIES") {
    const series = catalogSeriesId(id);
    return series === null ? null : { parentSeriesId: series };
  }
  const match = type === "SEASON" ? /^([1-9]\d*):s(0|[1-9]\d*)$/.exec(id) : type === "EPISODE" ? /^([1-9]\d*):s(0|[1-9]\d*):e([1-9]\d*)$/.exec(id) : null;
  if (!match) return null;
  const numbers = match.slice(1).map(Number);
  if (numbers.some(value => !Number.isSafeInteger(value) || value > 2147483647)) return null;
  return { parentSeriesId: numbers[0], seasonIdx: numbers[1], ...(type === "EPISODE" ? { episodeNumber: numbers[2] } : {}) };
}
