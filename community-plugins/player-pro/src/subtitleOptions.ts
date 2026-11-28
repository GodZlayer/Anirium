export type SubtitleOption = { id: string; language: string; title?: string };

export function existingSubtitleOptions(tracks: SubtitleOption[], language?: string): SubtitleOption[] {
  const seen = new Set<string>();
  return tracks.filter(track => {
    if (!track.id.trim() || !track.language.trim() || seen.has(track.id)) return false;
    seen.add(track.id);
    return language === undefined || track.language === language;
  });
}

export function nextSubtitleOption(currentLanguage: string, clickedLanguage: string, index: number, count: number): number {
  if (currentLanguage !== clickedLanguage || count < 1) return 0;
  return ((Math.max(0, index) + 1) % count);
}
