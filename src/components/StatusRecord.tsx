"use client";

import { useState } from "react";
import ResumeEpisodeButton from "./ResumeEpisodeButton";
import { isReleaseUuid } from "../lib/profilePlaybackIdentity";

export interface EntityStatusRecord {
  id: string;
  entity_type: "UNIVERSE" | "SERIES" | "SEASON" | "EPISODE";
  entity_id: string;
  season_entity_id?: string | null;
  parent_series_id?: number | null;
  season_idx?: number | null;
  episode_number?: number | null;
  anime_title?: string | null;
  anime_title_portuguese?: string | null;
  status?: string | null;
  watched_seconds?: number | null;
  total_seconds?: number | null;
  user_score?: number | null;
  user_opinion?: string | null;
  contains_spoilers?: boolean;
}

export function isStatusPage(value: unknown): value is { success: true; statuses: EntityStatusRecord[]; nextCursor: string | null } {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (data.success !== true || !Array.isArray(data.statuses) || data.statuses.length > 1) return false;
  if (!(data.nextCursor === null || (typeof data.nextCursor === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(data.nextCursor)))) return false;
  if (!data.statuses.length && data.nextCursor !== null) return false;
  return data.statuses.every(row => row && typeof row === "object" && !Array.isArray(row) &&
    typeof row.id === "string" && row.id.length > 0 && row.id.length <= 100 &&
    typeof row.entity_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.entity_id) &&
    ["UNIVERSE", "SERIES", "SEASON", "EPISODE"].includes(row.entity_type) &&
    ["anime_title", "anime_title_portuguese", "status", "user_opinion"].every(field => row[field] == null || typeof row[field] === "string") &&
    ["parent_series_id", "season_idx", "episode_number", "watched_seconds", "total_seconds", "user_score"].every(field => row[field] == null || (typeof row[field] === "number" && Number.isFinite(row[field]))) &&
    (row.season_entity_id == null || isReleaseUuid(row.season_entity_id)) &&
    (row.contains_spoilers == null || typeof row.contains_spoilers === "boolean"));
}

function integer(value: unknown, minimum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= 2147483647;
}
export function statusPlaybackIdentity(record: EntityStatusRecord) {
  return record.entity_type === "EPISODE" && isReleaseUuid(record.entity_id) && isReleaseUuid(record.season_entity_id) && integer(record.parent_series_id, 1) && integer(record.season_idx, 0) && integer(record.episode_number, 1)
    ? { animeId: record.parent_series_id, seasonIdx: record.season_idx, episode: record.episode_number, seasonEntityId: record.season_entity_id, episodeEntityId: record.entity_id } : null;
}
export function statusSeriesIdentity(record: EntityStatusRecord): number | null {
  if (record.entity_type === "SERIES") {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.entity_id) && integer(record.parent_series_id,1) ? record.parent_series_id : null;
  }
  return (record.entity_type === "SEASON" || record.entity_type === "EPISODE") && integer(record.parent_series_id, 1) ? record.parent_series_id : null;
}
export function statusProgress(record: EntityStatusRecord) {
  return typeof record.watched_seconds === "number" && Number.isFinite(record.watched_seconds) && record.watched_seconds >= 0 &&
    typeof record.total_seconds === "number" && Number.isFinite(record.total_seconds) && record.total_seconds > 0
    ? Math.min(100, Math.round(record.watched_seconds / record.total_seconds * 100)) : null;
}
export function statusScore(record: EntityStatusRecord) {
  return typeof record.user_score === "number" && Number.isFinite(record.user_score) && record.user_score >= 0 && record.user_score <= 10 ? record.user_score : null;
}
export function opinionChunks(opinion: string, size = 240) {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError("Invalid opinion page size");
  const characters = Array.from(opinion);
  const chunks = [];
  for (let start = 0; start < characters.length; start += size) chunks.push(characters.slice(start, start + size).join(""));
  return chunks;
}

const degrees = { UNIVERSE: "Franquia", SERIES: "Obra", SEASON: "Temporada", EPISODE: "Episódio" };
const states: Record<string, string> = { watching: "Assistindo", completed: "Concluído", on_hold: "Em pausa", plan_to_watch: "Para assistir", dropped: "Interrompido" };

export default function StatusRecord({ record, onSelectAnime, onPlayEpisode, onClose }: {
  record: EntityStatusRecord;
  onSelectAnime?: (id: number) => void;
  onPlayEpisode?: (id: number, season: number, episode: number, seasonEntityId: string, episodeEntityId: string) => boolean | Promise<boolean>;
  onClose: () => void;
}) {
  const [section, setSection] = useState<"progress" | "review">("progress");
  const [opinionPage, setOpinionPage] = useState(0);
  const score = statusScore(record);
  const opinion = typeof record.user_opinion === "string" ? record.user_opinion : "";
  const chunks = opinionChunks(opinion);
  const page = Math.min(opinionPage, Math.max(0, chunks.length - 1));
  const playback = statusPlaybackIdentity(record);
  const seriesId = statusSeriesIdentity(record);
  const progress = statusProgress(record);
  const hasReview = score !== null || opinion.length > 0;
  const activeSection = hasReview ? section : "progress";
  return <article className="rounded-2xl border border-[#3A3A43] bg-[#1A1A1F] p-3 space-y-2">
    <div className="flex justify-between gap-2 text-xs text-[#FFC766]"><span>{degrees[record.entity_type]}</span><span>{states[record.status || ""] || "Estado indisponível"}</span></div>
    <h4 className="text-sm font-bold break-words">{record.anime_title_portuguese || record.anime_title || `Entidade #${record.entity_id}`}</h4>
    <nav aria-label="Contextos do registro" className="flex gap-2 text-xs">
      <button type="button" aria-pressed={activeSection === "progress"} onClick={() => setSection("progress")} className="px-2 py-1 border rounded">Progresso</button>
      {hasReview && <button type="button" aria-pressed={activeSection === "review"} onClick={() => setSection("review")} className="px-2 py-1 border rounded">Avaliação</button>}
    </nav>
    {activeSection === "progress" ? <div className="space-y-2 text-xs">
      <p>{integer(record.season_idx, 0) ? `Temporada ${record.season_idx + 1}` : "Temporada indisponível"}{integer(record.episode_number, 1) ? ` • Episódio ${record.episode_number}` : ""}</p>
      {progress !== null ? <div className="space-y-1"><div className="flex gap-2 items-center"><progress aria-label="Progresso assistido" value={progress} max={100} className="flex-1 min-w-0"/><span>{progress}%</span></div><p>Assistido: {record.watched_seconds}s / {record.total_seconds}s</p></div> : <p>Progresso indisponível</p>}
      <div className="flex flex-wrap gap-3">
        {playback && onPlayEpisode && <ResumeEpisodeButton key={record.id} label="Continuar episódio" onResume={() => onPlayEpisode(playback.animeId, playback.seasonIdx, playback.episode, playback.seasonEntityId, playback.episodeEntityId)} onConfirmed={onClose}/>}
        {seriesId !== null && onSelectAnime && <button type="button" onClick={() => { onSelectAnime(seriesId); onClose(); }} className="text-[#FFC766] underline">Ver obra</button>}
      </div>
    </div> : <div className="space-y-2 text-xs">
      {score !== null && <p>Sua avaliação: {score}/10</p>}
      {record.contains_spoilers === true && opinion && <p className="text-amber-300">Opinião com spoilers</p>}
      {opinion && <p className="whitespace-pre-wrap break-words" data-status-opinion>{chunks[page]}</p>}
      {chunks.length > 1 && <nav aria-label="Páginas da opinião" className="flex justify-between gap-2">
        <button type="button" disabled={page === 0} onClick={() => setOpinionPage(page - 1)}>Trecho anterior</button>
        <span aria-live="polite">{page + 1} / {chunks.length}</span>
        <button type="button" disabled={page + 1 >= chunks.length} onClick={() => setOpinionPage(page + 1)}>Próximo trecho</button>
      </nav>}
    </div>}
  </article>;
}
