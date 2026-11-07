export function selectArcNavigation(arcs, type, episode, selectedIndex, selectedReference) {
  const episodeIndex = arcs.findIndex(arc => episode >= arc.startEp && episode <= arc.endEp);
  const index = type === "season" ? -1 : type === "episode" ? episodeIndex
    : selectedReference ? arcs.findIndex(arc => arc.arcId === selectedReference)
    : arcs[selectedIndex] ? selectedIndex : arcs.length ? 0 : -1;
  const episodeArc = episodeIndex >= 0 ? arcs[episodeIndex] : null;
  return { index, activeArc: arcs[index] || null,
    currentEpisodeArc: episodeArc ? { ...episodeArc, episodeInArc: episode - episodeArc.startEp + 1 } : null };
}
