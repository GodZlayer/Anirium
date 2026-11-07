/**
 * Micro-Módulo Puro (~75 linhas): Entity Navigator & Context Graph Hook (TGCode Standard)
 * Gerencia o estado de navegação amarrada entre todas as telas canônicas de entidades
 * sem refresh e com resolução dinâmica no grafo da API (/api/catalog/graph/*).
 */

import { useState, useCallback } from "react";

export type EntityKind = "universe" | "work" | "arc" | "episode" | "creator" | "track" | "studio";

export interface ActiveEntityContext {
  kind: EntityKind;
  id: string;
  payload?: any;
}

export function useEntityNavigator() {
  const [history, setHistory] = useState<ActiveEntityContext[]>([]);
  const [current, setCurrent] = useState<ActiveEntityContext | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Navega para um nó específico do grafo
  const openEntity = useCallback(async (kind: EntityKind, id: string, initialPayload?: any) => {
    if (!id) return;
    setLoading(true);
    try {
      let resolvedData = initialPayload;

      // Se não recebemos payload, resolvemos diretamente no grafo da API
      if (!resolvedData) {
        if (kind === "work") {
          const res = await fetch(`/api/catalog/graph/work/${id}`);
          if (res.ok) resolvedData = await res.json();
        } else if (kind === "universe") {
          const res = await fetch(`/api/catalog/graph/universe/${id}`);
          if (res.ok) resolvedData = await res.json();
        } else if (kind === "creator") {
          const res = await fetch(`/api/catalog/graph/creator/${id}`);
          if (res.ok) resolvedData = await res.json();
        } else if (kind === "track") {
          const res = await fetch(`/api/catalog/graph/track/${id}`);
          if (res.ok) resolvedData = await res.json();
        } else if (kind === "studio") {
          const res = await fetch(`/api/catalog/graph/studio/${id}`);
          if (res.ok) resolvedData = await res.json();
        } else {
          const res = await fetch(`/api/catalog/context/${kind}/${id}`);
          if (res.ok) resolvedData = await res.json();
        }
      }

      const nextContext: ActiveEntityContext = { kind, id, payload: resolvedData };
      setHistory((prev) => (current ? [...prev, current] : prev));
      setCurrent(nextContext);
    } catch (err) {
      console.error(`[EntityNavigator] Erro ao carregar nó ${kind}:${id}`, err);
    } finally {
      setLoading(false);
    }
  }, [current]);

  // Retorna ao nó anterior da malha
  const goBack = useCallback(() => {
    if (history.length === 0) {
      setCurrent(null);
      return;
    }
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setCurrent(previous);
  }, [history]);

  // Fecha qualquer tela de modal
  const closeAll = useCallback(() => {
    setCurrent(null);
    setHistory([]);
  }, []);

  return {
    current,
    history,
    loading,
    openEntity,
    goBack,
    closeAll,
    isOpen: current !== null,
  };
}
