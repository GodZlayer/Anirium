import React from "react";
import { Calendar } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { calendarCopy, calendarText, calendarWeekDays } from "../lib/calendarPresentation.mjs";

export function CalendarHeader({ selectedDay, currentDay, count, onSelect }: {
  selectedDay: number; currentDay: number; count: number; onSelect: (day: number) => void;
}) {
  const { language, tokens } = useDesignTheme();
  const labels = calendarCopy(language), days = calendarWeekDays(language), colors = tokens.colors;
  return <div className="p-4 rounded-3xl border flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-xl shadow-xl flex-none"
    style={{ backgroundColor: colors.bgOverlay, borderColor: colors.borderDefault }}>
    <div className="flex items-center gap-3">
      <div className="p-2.5 rounded-2xl border backdrop-blur-md"
        style={{ color: colors.accentGold, backgroundColor: colors.bgSurface, borderColor: colors.borderHighlight }}>
        <Calendar className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: colors.textPrimary }}>
          {labels.weekly} • {days[selectedDay].full}
        </h2>
        <p className="text-[11px] font-mono" style={{ color: colors.textMuted }}>
          {calendarText(language, "count", { count: count.toLocaleString(language) })}
        </p>
      </div>
    </div>
    <div className="flex items-center p-1 rounded-2xl border backdrop-blur-xl shadow-inner gap-1"
      style={{ backgroundColor: colors.bgSurface, borderColor: colors.borderDefault }}>
      {days.map(day => {
        const selected = selectedDay === day.id;
        return <button key={day.id} onClick={() => onSelect(day.id)} aria-label={day.full} aria-pressed={selected}
          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${selected ? "shadow-md scale-105" : "opacity-60 hover:opacity-100"}`}
          style={{ backgroundColor: selected ? colors.accentGold : undefined, color: selected ? colors.bgBase : colors.textSecondary }}>
          <span>{day.label}</span>
          {currentDay === day.id && <span className="w-1.5 h-1.5 rounded-full" title={labels.today}
            style={{ backgroundColor: selected ? colors.bgBase : colors.stateSuccess }} />}
        </button>;
      })}
    </div>
  </div>;
}
