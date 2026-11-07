import { useEffect, useState } from "react";
import { readDiscussion, postDiscussion } from "./discussionClient.mjs";

export function useDiscussion(contextKey: string, contextType: string, language: string, isAuthenticated: boolean, onPostComment?: (text: string, spoiler: boolean) => void) {
  const [comments, setComments] = useState<any[]>([]);
  const [newText, setNewText] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setComments([]); setNewText(""); setIsSpoiler(false); setError(false);
    readDiscussion(contextType, contextKey, { signal: controller.signal, language }).then(result => {
      if (!controller.signal.aborted) setComments(previous => [...new Map([...previous, ...result].map(item => [item.id, item])).values()]);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [contextKey, contextType, language]);
  const handleSubmit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!isAuthenticated || busy || !newText.trim()) return;
    const text = newText.trim();
    setBusy(true); setError(false);
    try {
      const comment = await postDiscussion(contextType, contextKey, text, isSpoiler, { language });
      setComments(previous => [comment, ...previous.filter(item => item.id !== comment.id)]);
      onPostComment?.(text, isSpoiler);
      setNewText(""); setIsSpoiler(false);
      void import("./telemetryXpLoop").then(telemetry => telemetry.registerCommentXp(contextKey, isAuthenticated)).catch(() => {});
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return { comments, newText, setNewText, isSpoiler, setIsSpoiler, busy, error, handleSubmit };
}
