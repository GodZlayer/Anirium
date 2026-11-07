import React from "react";
import { Play } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { PLAYBACK_STRINGS } from "../lib/playbackStrings";

export function PlayerLaunchState({ title, poster, episode, authenticated, player, officialPlus, onPlay }: {
  title: string; poster?: string; episode: number; authenticated: boolean;
  player?: string; officialPlus: boolean; onPlay: () => void;
}) {
  const { tokens, language } = useDesignTheme();
  const labels = PLAYBACK_STRINGS[language] || PLAYBACK_STRINGS["pt-BR"];
  return <section className="relative w-full aspect-video rounded-2xl overflow-hidden border flex items-center justify-center p-4"
    style={{ backgroundColor: tokens.colors.bgSurface, borderColor: tokens.colors.borderDefault }}>
    {poster && <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />}
    <div className="relative flex flex-col items-center gap-2 text-center max-w-lg" style={{ color: tokens.colors.textPrimary }}>
      <span className="text-xs opacity-70">{labels.episode} {episode}</span>
      <h3 className="font-bold text-sm sm:text-lg line-clamp-2">{title}</h3>
      {authenticated && player ? <>
        <button type="button" onClick={onPlay} aria-label={`${labels.start}: ${player}`}
          className="p-3 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: tokens.colors.accentGold, color: tokens.colors.bgBase }}><Play className="w-6 h-6" /></button>
        <span className="text-xs">{player}</span>
        {officialPlus && <p className="text-xs opacity-80">{labels.service}</p>}
      </> : <>
        <p className="text-xs font-semibold">{labels.accountPlayer}</p>
        <p className="text-xs opacity-80">{authenticated ? labels.noPlayer : labels.signIn}</p>
      </>}
    </div>
  </section>;
}
