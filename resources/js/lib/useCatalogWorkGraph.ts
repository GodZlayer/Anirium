import { useEffect, useState } from "react";
import { requestWorkGraph } from "./catalogEntityGraph.mjs";

export function useCatalogWorkGraph(workId: string | undefined, accountId: number | undefined, adult: boolean) {
  const [revision, setRevision] = useState(0);
  const scope = `${workId || ""}:${accountId || 0}:${adult}:${revision}`;
  const [result, setResult] = useState<{ scope: string; phase: string; graph: any }>({ scope: "", phase: "idle", graph: null });
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("anirium_generation_updated", refresh);
    return () => window.removeEventListener("anirium_generation_updated", refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ scope, phase: workId ? "loading" : "idle", graph: null });
    if (workId) requestWorkGraph(workId, controller.signal).then(graph => {
      if (!controller.signal.aborted) setResult({ scope, phase: "ready", graph });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ scope, phase: "unavailable", graph: null });
    });
    return () => controller.abort();
  }, [workId, scope]);
  return result.scope === scope ? result : { phase: workId ? "loading" : "idle", graph: null };
}
