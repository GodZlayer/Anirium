"use client";

import React, { useState } from "react";
import { Layers, Plus, Code, X, Terminal } from "lucide-react";
import ModalDialog from "./ModalDialog";
import { useUser } from "@/context/UserContext";

export default function AddonDevStudio({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { refreshUser, user } = useUser();
  const [activeTab, setActiveTab] = useState<"architecture" | "import">("architecture");

  // Interface plugin registration; no provider lookup in the Core.
  const [manifestJsonInput, setManifestJsonInput] = useState(`{
  "id": "community.custom.panel",
  "name": "Custom Community Panel",
  "version": "1.0.0",
  "description": "Extensão de interface para testes locais no Addon Studio.",
  "author": "Dev Community",
  "type": "community",
  "capabilities": ["ui.panel.render"],
  "permissions": [],
  "enabled": true
}`);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importState, setImportState] = useState<"idle" | "saving" | "saved" | "error" | "unsynced">("idle");
  const [architectureSection, setArchitectureSection] = useState<"core" | "player" | "service">("core");
  const importPending = React.useRef(false);
  const importIdentityRef = React.useRef(user?.id ?? "");
  importIdentityRef.current = user?.id ?? "";
  React.useEffect(() => { setImportStatus(null); setImportState("idle"); }, [user?.id]);


  if (!isOpen) return null;

  const handleRegisterManifest = async () => {
    if (importPending.current) return;
    let parsed;
    try { parsed = JSON.parse(manifestJsonInput); }
    catch { setImportState("error"); setImportStatus("JSON inválido. Revise o manifesto."); return; }
    const identity = importIdentityRef.current;
    importPending.current = true; setImportState("saving"); setImportStatus("Registrando manifesto…");
    try {
      const res = await fetch("/api/sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install_manifest", manifest: parsed }),
      });
      const data = await res.json();
      if (!res.ok || data.success !== true) throw new Error("Registration rejected");
      if (identity !== importIdentityRef.current) return;
      const confirmed = await refreshUser();
      if (identity !== importIdentityRef.current) return;
      setImportState(confirmed ? "saved" : "unsynced");
      setImportStatus(confirmed ? "Manifesto registrado na conta." : "Registro recebido; atualização da conta indisponível. Confira os Plugins antes de tentar novamente.");
    } catch {
      if (identity === importIdentityRef.current) { setImportState("error"); setImportStatus("Não foi possível confirmar o registro. Confira os Plugins antes de tentar novamente."); }
    } finally { importPending.current = false; }
  };

  return (
    <ModalDialog label="Addon DevStudio" onClose={() => { if (!importPending.current) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !importPending.current) onClose(); }}
      className="fixed inset-0 z-50 w-screen h-screen bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl bg-[#0f1115] border border-emerald-500/40 rounded-2xl shadow-2xl overflow-hidden text-white flex flex-col h-full max-h-[90vh]"
      >
        {/* Header Terminal Style */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-800 bg-[#090b0e]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold font-mono text-emerald-400">
                  Addon DevStudio
                </h2>
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded">
                  NÍVEL 3 • ARQUITETO
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Cadastro de plugins e responsabilidades dos componentes.
              </p>
            </div>
          </div>

          <button
            onClick={onClose} aria-label="Fechar DevStudio" disabled={importState === "saving"}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Navbar de Abas */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-zinc-800 bg-[#0d0f12]">
          <button
            onClick={() => setActiveTab("architecture")}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
              activeTab === "architecture"
                ? "border-emerald-500 text-emerald-400 bg-zinc-900/60"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Responsabilidades</span>
          </button>

          <button
            onClick={() => setActiveTab("import")}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
              activeTab === "import"
                ? "border-emerald-500 text-emerald-400 bg-zinc-900/60"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Importador de Manifestos JSON</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-3 min-h-0 flex-1 space-y-3">
          {activeTab === "architecture" && (
            <div className="space-y-3">
              <nav aria-label="Responsabilidades dos componentes" className="flex gap-2 text-xs">
                {([['core','Core'],['player','Player'],['service','Service local']] as const).map(([id,label]) => <button key={id} aria-pressed={architectureSection === id} onClick={() => setArchitectureSection(id)} className="px-3 py-2 border border-zinc-700 rounded">{label}</button>)}
              </nav>
              <div className="p-3 rounded-xl border border-zinc-700"><p className="text-sm text-zinc-300">{architectureSection === "core" ? "Catálogo, fontes oficiais, conta e referências de addons." : architectureSection === "player" ? "Exibe mídia do Service ou arquivo/link direto." : "Valida Anirium+, consulta addons autorizados e prepara a mídia."}</p></div>
              <p className="text-xs text-zinc-400">Informações de arquitetura, não telemetria. Adicione URLs de manifestos no perfil; o Core não consulta esses servidores.</p>
            </div>
          )}

          {activeTab === "import" && (
            <div className="space-y-2">
              <div>
                <label htmlFor="studio-manifest" className="text-xs font-mono text-zinc-400 block mb-1">
                  Definição do Manifesto (JSON):
                </label>
                <textarea
                  id="studio-manifest" rows={4} disabled={importState === "saving"}
                  value={manifestJsonInput}
                  onChange={(e) => setManifestJsonInput(e.target.value)}
                  className="w-full bg-black/80 border border-zinc-700 rounded-xl p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {importStatus && (
                <div role={importState === "error" || importState === "unsynced" ? "alert" : "status"} className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono">
                  {importStatus}
                </div>
              )}

              <button
                disabled={importState === "saving"} aria-busy={importState === "saving"}
                onClick={handleRegisterManifest}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition"
              >
                <Code className="w-4 h-4" />
                <span>Registrar na conta</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-[#090b0e] flex justify-between items-center text-xs text-zinc-400">
          <span className="font-mono text-[11px]">
            Cadastro de conta • Não executa providers
          </span>
          <button
            onClick={onClose} disabled={importState === "saving"}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs transition"
          >
            Fechar Console
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
