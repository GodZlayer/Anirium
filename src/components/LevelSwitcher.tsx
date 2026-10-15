"use client";

import ModalDialog from "./ModalDialog";

import React, { useState } from "react";
import {
  ShieldCheck,
  UserCheck,
  Zap,
  Terminal,
  Check,
  ChevronRight,
  Layers,
  Sparkles,
  ExternalLink,
  Sliders,
  X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { redirectGoogleLogin } from "@/lib/googleLoginClient";
import { ExperienceLevel } from "@/lib/userProfiles";

interface LevelOption {
  level: ExperienceLevel;
  title: string;
  subtitle: string;
  badge: string;
  color: string;
  borderColor: string;
  bgGradient: string;
  icon: React.ComponentType<{ className?: string }>;
  features: string[];
  disabledNotice?: string;
}

const LEVELS: LevelOption[] = [
  {
    level: 0,
    title: "Nível 0: Canônico Puro",
    subtitle: "Catálogo e fontes oficiais",
    badge: "Canônico",
    color: "text-zinc-300",
    borderColor: "border-zinc-700",
    bgGradient: "from-zinc-900 to-zinc-950",
    icon: ShieldCheck,
    features: [
      "Metadados factuais canônicos (MyAnimeList / AniList)",
      "Genealogia e ordem cronológica da franquia",
      "Trailers oficiais e teasers do YouTube",
      "Links diretos para plataformas licenciadas (Crunchyroll, Netflix)",
      "Descoberta por metadados e links oficiais",
    ],
    disabledNotice: "Histórico pessoal e favoritos sincronizados requerem login.",
  },
  {
    level: 1,
    title: "Nível 1: Membro da Comunidade",
    subtitle: "Identidade e preferências",
    badge: "Membro",
    color: "text-blue-400",
    borderColor: "border-blue-500/40",
    bgGradient: "from-blue-950/40 to-zinc-900",
    icon: UserCheck,
    features: [
      "Perfil de usuário com avatar e preferências salvas",
      "Catálogo e calendário de lançamentos",
      "Busca e linhagem de franquias",
      "Links para fontes oficiais",
    ],
  },
  {
    level: 2,
    title: "Nível 2: Anirium+ (Otaku Pro)",
    subtitle: "Recursos Pro e Service local",
    badge: "Anirium+",
    color: "text-[#FFC766]",
    borderColor: "border-[#FFC766]/50",
    bgGradient: "from-[#FFC766]/20 via-[#1A1A1F] to-zinc-900",
    icon: Zap,
    features: [
      "Favoritos por franquia, obra, temporada e episódio",
      "Progresso e histórico de episódios",
      "Extensões habilitadas no perfil",
      "Autorização do Service local",
    ],
    disabledNotice: "Disponível exclusivamente via assinatura Anirium+ ou liberação do Administrador.",
  },
  {
    level: 3,
    title: "Nível 3: Administrador Geral",
    subtitle: "Painel de controle de contas e Anirium+",
    badge: "Admin",
    color: "text-emerald-400",
    borderColor: "border-emerald-500/50",
    bgGradient: "from-emerald-950/40 via-zinc-900 to-black",
    icon: Terminal,
    features: [
      "Painel administrativo com visualização de todas as contas",
      "Controle direto de ativação e revogação do Anirium+",
      "Auditoria de contas ativas e sessões",
    ],
    disabledNotice: "Acesso restrito exclusivamente à conta de Administrador do sistema.",
  },
];

export default function LevelSwitcher({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, level, switchLevel, isLoading } = useUser();
  const [selectedLevel, setSelectedLevel] = useState<ExperienceLevel>(level);
  const [section, setSection] = useState<"summary" | "features" | "account">("summary");
  const [featurePage, setFeaturePage] = useState(0);
  const [actionError, setActionError] = useState(false);
  const [activating, setActivating] = useState(false);
  const activationPending = React.useRef(false);
  React.useEffect(() => {
    if (isOpen) { setSelectedLevel(level); setSection("summary"); setFeaturePage(0); setActionError(false); }
  }, [isOpen, level]);
  if (!isOpen) return null;
  const option = LEVELS.find(item => item.level === selectedLevel)!;
  const Icon = option.icon;
  const featurePages = Math.ceil(option.features.length / 2);
  const isCurrent = level === selectedLevel;
  const restricted = selectedLevel === 3 && level < 3 ? "Restrito Admin" : selectedLevel === 2 && level < 2 ? "Requer Anirium+" : "";
  const busy = activating || isLoading;
  const activate = async () => {
    if (activationPending.current || busy || restricted || isCurrent) return;
    activationPending.current = true; setActivating(true); setActionError(false);
    try { if (await switchLevel(selectedLevel)) onClose(); else setActionError(true); }
    catch { setActionError(true); }
    finally { activationPending.current = false; setActivating(false); }
  };
  return (
    <ModalDialog label="Níveis do Anirium" onClose={onClose} onClick={onClose}
      className="fixed inset-0 w-screen h-screen bg-black/80 backdrop-blur-md flex items-center justify-center p-3">
      <div onClick={event => event.stopPropagation()} className="w-full max-w-3xl h-full rounded-2xl border border-[#3A3A43] bg-[#0B0B0D] text-[#FFF9F0] flex flex-col p-3 sm:p-4 gap-3">
        <header className="flex items-center justify-between gap-2 flex-none">
          <h2 className="text-base font-semibold">Níveis</h2>
          <button aria-label="Fechar seletor de níveis" onClick={onClose} className="p-2 rounded-full border border-[#3A3A43]"><X className="w-4 h-4" /></button>
        </header>
        <nav aria-label="Escolher nível" className="flex gap-2 flex-none">
          {LEVELS.map(item => <button key={item.level} type="button" aria-label={`Nível ${item.level}: ${item.badge}`} aria-pressed={selectedLevel === item.level} disabled={busy}
            onClick={() => {setSelectedLevel(item.level); setFeaturePage(0); setActionError(false);}}
            className="flex-1 px-2 py-2 rounded-xl border border-[#3A3A43] text-sm aria-pressed:border-[#FFC766] aria-pressed:text-[#FFC766] disabled:opacity-50">{item.level}</button>)}
        </nav>
        <nav aria-label="Detalhes do nível" className="flex gap-2 flex-none">
          {([{id:"summary",label:"Resumo"},{id:"features",label:"Recursos"},{id:"account",label:"Conta"}] as const).map(item =>
            <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)} className="px-3 py-1.5 rounded-full border border-[#3A3A43] text-xs aria-pressed:border-[#FFC766] aria-pressed:text-[#FFC766]">{item.label}</button>)}
        </nav>
        <section aria-label={option.title} className="flex-1 min-h-0 flex flex-col gap-3">
          <div className={`flex items-start gap-2 ${option.color}`}><Icon className="w-5 h-5 shrink-0" /><h3 className="text-sm font-semibold">{option.title}</h3></div>
          {section === "summary" && <>
            <p className="text-sm text-zinc-300">{option.subtitle}</p>
            {option.disabledNotice && <p className="text-xs text-zinc-400">{option.disabledNotice}</p>}
            {actionError && <p role="alert" className="text-sm text-rose-400">Não foi possível alterar o nível. Tente novamente.</p>}
            <div className="mt-auto flex flex-wrap gap-2 items-center">
              {isCurrent ? <span className="text-sm text-emerald-400">Modo atual</span> : restricted ? <span className="text-sm text-[#FFC766]">{restricted}</span> :
                <button type="button" disabled={busy} onClick={activate} className="px-4 py-2 rounded-xl border border-[#FFC766] text-sm text-[#FFC766] disabled:opacity-50">{activating ? "Ativando…" : "Ativar este nível"}</button>}
            </div>
          </>}
          {section === "features" && <>
            <ul className="space-y-3 text-sm text-zinc-300">{option.features.slice(featurePage * 2, featurePage * 2 + 2).map(feature => <li key={feature} className="flex gap-2"><Check className="w-4 h-4 shrink-0 text-emerald-400" /><span>{feature}</span></li>)}</ul>
            <div className="mt-auto flex items-center justify-between gap-2 text-xs">
              <button type="button" aria-label="Recursos anteriores" disabled={featurePage === 0} onClick={() => setFeaturePage(page => Math.max(0,page-1))} className="p-2 border rounded-lg disabled:opacity-40">Anterior</button>
              <span aria-live="polite">{featurePage + 1} / {featurePages}</span>
              <button type="button" aria-label="Próximos recursos" disabled={featurePage + 1 >= featurePages} onClick={() => setFeaturePage(page => Math.min(featurePages-1,page+1))} className="p-2 border rounded-lg disabled:opacity-40">Próximo</button>
            </div>
          </>}
          {section === "account" && <>
            <p className="text-sm">{user?.display_name || "Visitante"}</p>
            <p className="text-xs text-zinc-400">{user?.id.startsWith("google-") ? "Conta Google conectada" : "Conecte sua Conta Google para sincronizar seus dados."}</p>
            <button type="button" onClick={redirectGoogleLogin} className="mt-auto self-start px-3 py-2 rounded-xl border border-[#FFC766] text-sm text-[#FFC766]">{user?.id.startsWith("google-") ? "Alternar Conta Google" : "Conectar com Google"}</button>
          </>}
        </section>
        <p className="flex-none text-xs text-zinc-400 border-t border-[#3A3A43] pt-2">Fontes oficiais disponíveis em todos os níveis.</p>
      </div>
    </ModalDialog>
  );
}
