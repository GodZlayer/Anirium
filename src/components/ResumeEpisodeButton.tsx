"use client";

import { useEffect, useRef, useState } from "react";

export default function ResumeEpisodeButton({ label, onResume, onConfirmed }: {
  label: string;
  onResume: () => boolean | Promise<boolean>;
  onConfirmed: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const resume = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      const confirmed = await onResume();
      if (!mounted.current) return;
      if (confirmed === true) onConfirmed();
      else setFailed(true);
    } catch { if (mounted.current) setFailed(true); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  return <div className="space-y-1 text-xs">
    <button type="button" disabled={pending} aria-busy={pending} onClick={resume} className="text-[#FFC766] underline disabled:opacity-60">{pending ? "Confirmando episódio…" : failed ? "Tentar novamente" : label}</button>
    {pending && <span role="status" className="sr-only">Confirmando episódio</span>}
    {failed && <p role="alert" className="text-rose-300">Retomada indisponível.</p>}
  </div>;
}
