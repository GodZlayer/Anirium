import React, { useState } from "react";
import { Orbit } from "lucide-react";
import { useDesignTheme } from "../context/ThemeContext";
import { WORK_UUID } from "../lib/catalogAliases.mjs";

export interface FranchiseNode { id: string; universeId: string; name: string; coords: { x: number; y: number } }
export interface FranchiseGroup { id: string; name: string; nodes: FranchiseNode[]; edges: Array<{ from: string; to: string }> }
interface OrbitalFranchiseMapProps { groups?: FranchiseGroup[]; onSelectWork?: (workId: string) => void }

export function OrbitalFranchiseMap({ groups = [], onSelectWork }: OrbitalFranchiseMapProps) {
  const { tokens, strings } = useDesignTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const valid = groups.filter(group => WORK_UUID.test(group.id));
  const current = valid.find(group => group.id === selected) || valid[0];
  if (!current) return null;
  const nodes = current.nodes.filter(node => WORK_UUID.test(node.id) && node.id !== current.id
    && node.universeId === current.id && [node.coords.x, node.coords.y].every(value => Number.isFinite(value) && value >= 0 && value <= 100));
  const byId = new Map(nodes.map(node => [node.id, node]));
  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-3xl border p-4"
      style={{ backgroundColor: tokens.colors.bgSurface, borderColor: tokens.colors.borderDefault }} aria-label={strings.labels.franchiseMapTitle}>
      <header className="flex shrink-0 items-center gap-2"><Orbit className="h-4 w-4" /><span>{current.name}</span>
        <nav className="ml-auto flex gap-1">{valid.map(group => (
          <button key={group.id} type="button" aria-pressed={group.id === current.id} onClick={() => setSelected(group.id)}
            className="rounded px-2 py-1 text-xs">{group.name}</button>
        ))}</nav>
      </header>
      <div className="relative min-h-0 flex-1">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          {current.edges.map((edge, index) => {
            const from = byId.get(edge.from), to = byId.get(edge.to);
            return from && to ? <line key={index} x1={from.coords.x} y1={from.coords.y} x2={to.coords.x} y2={to.coords.y}
              stroke={tokens.colors.borderDefault} strokeWidth={0.4} /> : null;
          })}
        </svg>
        {nodes.map(node => (
          <button key={node.id} type="button" onClick={() => onSelectWork?.(node.id)} disabled={!onSelectWork} title={node.name}
            className="absolute max-w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-xl border px-3 py-2 text-xs focus-visible:outline"
            style={{ left: node.coords.x + "%", top: node.coords.y + "%", backgroundColor: tokens.colors.bgSurface, borderColor: tokens.colors.borderDefault }}>
            <span className="line-clamp-2">{node.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
