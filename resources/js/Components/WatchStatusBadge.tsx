import React from "react";
import { CheckCircle2, Clock } from "lucide-react";
import type { WatchCompletionStatus } from "../lib/watchCompletion";

interface WatchStatusBadgeProps {
  status: WatchCompletionStatus;
  /** Rótulo quando completo (padrão: "Assistido" para episódio ou "Completo" para obra/arco/universo) */
  completeLabel?: string;
  compact?: boolean;
  className?: string;
}

export function WatchStatusBadge({
  status,
  completeLabel = "Completo",
  compact = false,
  className = "",
}: WatchStatusBadgeProps) {
  if (status.status === "none") return null;

  if (status.status === "complete") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 text-emerald-300 font-bold backdrop-blur-md ${
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
        } ${className}`}
        title={status.total > 0 ? `${status.watched}/${status.total} assistidos` : completeLabel}
      >
        <CheckCircle2 className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
        <span>{completeLabel}</span>
      </span>
    );
  }

  const label = status.total > 0 ? `${status.watched}/${status.total}` : `${status.watched} ep`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/20 text-amber-200 font-bold backdrop-blur-md ${
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      } ${className}`}
      title={`${label} assistidos`}
    >
      <Clock className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
      <span>{label}</span>
    </span>
  );
}
