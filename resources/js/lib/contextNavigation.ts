import { validCatalogAlias, WORK_UUID } from "./catalogAliases.mjs";

export interface ContextParameters {
  workId?: string;
  episode: number;
  arcIndex: number;
  viewMode: "arcs" | "releases";
  hideFillers: boolean;
}
export type ContextType = "universe" | "work" | "season" | "arc" | "episode" | "manga" | "novel";
const types = new Set<string>(["universe", "work", "season", "arc", "episode", "manga", "novel"]);
export function readNavigationContext(value: unknown): { type: ContextType; id: string; params: ContextParameters } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const step = value as Record<string, unknown>;
  const id = typeof step.id === "string" ? step.id : typeof step.id === "number" ? String(step.id) : "";
  const numeric = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
  const alias = validCatalogAlias(id) && (id.startsWith("work:") || Number.isSafeInteger(Number(id.split(":")[1])));
  if (typeof step.type !== "string" || !types.has(step.type) || (!numeric && !alias && !WORK_UUID.test(id))) return null;
  const params = step.params && typeof step.params === "object" && !Array.isArray(step.params) ? step.params as Record<string, unknown> : {};
  const integer = (value: unknown, minimum: number, fallback: number) => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= 100000 ? value : fallback;
  return { type: step.type as ContextType, id, params: {
    ...(typeof params.workId === "string" && WORK_UUID.test(params.workId) ? { workId: params.workId.toLowerCase() } : {}),
    episode: integer(params.episode, 1, 1), arcIndex: integer(params.arcIndex, 0, 0),
    viewMode: params.viewMode === "arcs" || params.viewMode === "releases" ? params.viewMode : step.type === "universe" ? "releases" : "arcs",
    hideFillers: params.hideFillers === true,
  } };
}
export function initialLobbyNavigation(explicit: unknown, search: string, stack: unknown): {
  tab: "home" | "explore" | "calendar" | "context";
  context: ReturnType<typeof readNavigationContext>;
} {
  const context = readNavigationContext(explicit);
  if (context) return { tab: "context", context };
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "home" || tab === "explore" || tab === "calendar") return { tab, context: null };
  const saved = Array.isArray(stack) ? readNavigationContext(stack.at(-1)) : null;
  return saved ? { tab: "context", context: saved } : { tab: "home", context: null };
}
