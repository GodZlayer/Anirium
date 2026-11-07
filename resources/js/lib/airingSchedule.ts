/**
 * Horário de transmissão real (grade oficial em UTC) convertido para o fuso local.
 * Suporta obras com horário exato e obras com apenas o dia confirmado.
 */

import { calendarText } from "./calendarPresentation.mjs";

const UTC_DAY_INDEX: Record<string, number> = {
  sunday: 0,
  sundays: 0,
  monday: 1,
  mondays: 1,
  tuesday: 2,
  tuesdays: 2,
  wednesday: 3,
  wednesdays: 3,
  thursday: 4,
  thursdays: 4,
  friday: 5,
  fridays: 5,
  saturday: 6,
  saturdays: 6,
};

export interface LocalAiring {
  /** 0 = segunda ... 6 = domingo (no fuso local) */
  dayIndex: number;
  /** HH:mm no fuso local ou vazio quando não houver hora fixada */
  time: string;
  /** minutos desde 00:00 local, para ordenação (1440 = sem hora fixa, vai para o final do dia) */
  minutes: number;
  /** Indica se possui hora fixada ou apenas o dia */
  hasTime: boolean;
}

export function getLocalAiring(
  airingDay: string | undefined | null,
  airingTime: string | undefined | null,
  now: Date = new Date(),
  _malId?: number | string | null,
  releaseAirDateUtc?: string | null
): LocalAiring | null {
  // 1. Prioridade: Se houver airing_day documentado
  if (airingDay) {
    const cleanDay = airingDay.trim().toLowerCase();
    const utcDay = UTC_DAY_INDEX[cleanDay] ?? UTC_DAY_INDEX[cleanDay.replace(/s$/, "")];

    if (utcDay !== undefined) {
      const rawTime = airingTime?.trim() || "";
      const match = /^(\d{1,2}):(\d{2})$/.exec(rawTime);

      if (match) {
        const hours = Number(match[1]);
        const mins = Number(match[2]);
        if (hours <= 23 && mins <= 59) {
          const sundayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay());
          const instant = new Date(sundayUtc + utcDay * 86400000 + hours * 3600000 + mins * 60000);
          const localDay = instant.getDay(); // 0 = domingo
          const localHours = instant.getHours();
          const localMins = instant.getMinutes();

          return {
            dayIndex: (localDay + 6) % 7,
            time: `${String(localHours).padStart(2, "0")}:${String(localMins).padStart(2, "0")}`,
            minutes: localHours * 60 + localMins,
            hasTime: true,
          };
        }
      }

      // Anime tem dia documentado mas ainda não tem hora exata
      return {
        dayIndex: (utcDay + 6) % 7,
        time: "",
        minutes: 1440,
        hasTime: false,
      };
    }
  }

  // 2. Fallback: Se não tem airing_day mas tem data de lançamento do episódio mais recente
  if (releaseAirDateUtc) {
    const instant = new Date(releaseAirDateUtc);
    if (!isNaN(instant.getTime())) {
      const localDay = instant.getDay();
      const localHours = instant.getHours();
      const localMins = instant.getMinutes();
      return {
        dayIndex: (localDay + 6) % 7,
        time: `${String(localHours).padStart(2, "0")}:${String(localMins).padStart(2, "0")}`,
        minutes: localHours * 60 + localMins,
        hasTime: true,
      };
    }
  }

  return null;
}

/** Retorna rótulo de tempo relativo inteligente para o dia selecionado */
export function getAiringStatusLabel(
  airing: LocalAiring,
  selectedDay: number,
  now: Date = new Date(),
  language = "pt-BR"
): string {
  // Quando não tem hora fixada, exibe indicação clara
  if (!airing.hasTime || !airing.time) {
    return calendarText(language, "timeTba");
  }

  const currentWeekDay = (now.getDay() + 6) % 7;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (selectedDay === currentWeekDay) {
    const diff = airing.minutes - currentMinutes;
    if (diff < -30) {
      return calendarText(language, "scheduled", { time: airing.time });
    }
    if (diff <= 0 && diff >= -30) {
      return calendarText(language, "now", { time: airing.time });
    }
    if (diff > 0 && diff <= 120) {
      return calendarText(language, "inMinutes", { minutes: diff.toLocaleString(language), time: airing.time });
    }
    return calendarText(language, "todayAt", { time: airing.time });
  }

  return calendarText(language, "at", { time: airing.time });
}
