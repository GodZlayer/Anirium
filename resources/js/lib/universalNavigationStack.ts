/**
 * Micro-Módulo Puro (~50 linhas): Universal Navigation Stack (TGCode Standard)
 * Governa a pilha de navegação reversível em até 30 ações para o site inteiro.
 * Cada ação é um estado atômico desfazível determinístico.
 */

import { readNavigationContext, type ContextParameters } from "./contextNavigation.ts";

export interface NavigationStep {
  path: string;
  type?: "home" | "universe" | "work" | "season" | "episode" | "arc" | "manga" | "novel";
  id?: string | number;
  label: string;
  params?: Partial<ContextParameters>;
  timestamp: number;
}

const STACK_KEY = "anirium_nav_stack_v1";
const MAX_STACK_SIZE = 30;

export function loadNavigationStack(): NavigationStep[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(-MAX_STACK_SIZE).flatMap(step => {
        const context = readNavigationContext(step);
        return context ? [{ ...context, path: `/view/${context.type}/${context.id}`,
          label: typeof step.label === "string" ? step.label.slice(0, 300) : "",
          timestamp: Number.isFinite(step.timestamp) ? step.timestamp : 0 }] : [];
      });
    }
  } catch {}
  return [];
}

export function pushNavigationStep(step: Omit<NavigationStep, "timestamp">): NavigationStep[] {
  if (typeof window === "undefined") return [];
  const stack = loadNavigationStack();
  const context = readNavigationContext(step);
  if (!context) return stack;
  
  // Evitar duplicar consecutivamente o mesmo alvo exato
  const last = stack[stack.length - 1];
  if (last && JSON.stringify(readNavigationContext(last)) === JSON.stringify(context)) {
    return stack;
  }

  const newStep: NavigationStep = { ...context, path: `/view/${context.type}/${context.id}`, label: step.label, timestamp: Date.now() };
  stack.push(newStep);

  // Pilha de 30 Ações: quando entra o 31º, queima o 1º (FIFO / shift)
  while (stack.length > MAX_STACK_SIZE) {
    stack.shift();
  }

  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    window.dispatchEvent(new CustomEvent("anirium_nav_stack_updated", { detail: stack }));
  } catch {}

  return stack;
}

export function popNavigationStep(): NavigationStep | null {
  if (typeof window === "undefined") return null;
  const stack = loadNavigationStack();
  if (stack.length === 0) return null;

  stack.pop(); // Remove o estado atual
  const previous = stack[stack.length - 1] || null;

  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    window.dispatchEvent(new CustomEvent("anirium_nav_stack_updated", { detail: stack }));
  } catch {}

  return previous;
}

export function clearNavigationStack(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STACK_KEY);
    window.dispatchEvent(new CustomEvent("anirium_nav_stack_updated", { detail: [] }));
  } catch {}
}
