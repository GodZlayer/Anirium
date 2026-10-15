/**
 * Central de Strings, Tokens Visuais e Dicionário de UX/UI (TGCode Standard)
 * 100% Stringado: Nenhum texto, link de asset, cor ou rótulo hardcoded na interface.
 * Permite troca instantânea de idioma (i18n), temas (Dark, Light, AMOLED, Cyberpunk)
 * e gamificação adaptável de acordo com o nível da conta do usuário.
 */

export interface DesignTokens {
  themeId: string;
  colors: {
    bgBase: string;
    bgSurface: string;
    bgRaised: string;
    bgOverlay: string;
    borderDefault: string;
    borderHighlight: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accentGold: string;
    accentAmber: string;
    statePrimary: string;
    stateSuccess: string;
    stateWarning: string;
    stateError: string;
  };
  typography: {
    fontFamily: string;
    fontSizeHero: string;
    fontSizeTitle: string;
    fontSizeBody: string;
    fontSizeMicro: string;
  };
  radii: {
    card: string;
    button: string;
    badge: string;
  };
}

export const THEME_PALETTES: Record<string, DesignTokens> = {
  black: {
    themeId: "black",
    colors: {
      bgBase: "#0B0B0D",
      bgSurface: "#1A1A1F",
      bgRaised: "#23232A",
      bgOverlay: "rgba(11, 11, 13, 0.85)",
      borderDefault: "#3A3A43",
      borderHighlight: "#FFC766",
      textPrimary: "#FFF9F0",
      textSecondary: "#EADCC8",
      textMuted: "#8E8E93",
      accentGold: "#FFC766",
      accentAmber: "#FFB347",
      statePrimary: "#1E88E5",
      stateSuccess: "#43A047",
      stateWarning: "#FDD835",
      stateError: "#E53935",
    },
    typography: {
      fontFamily: "var(--font-geist-sans), sans-serif",
      fontSizeHero: "clamp(1.75rem, 4vw, 3rem)",
      fontSizeTitle: "clamp(1rem, 2vw, 1.35rem)",
      fontSizeBody: "0.875rem",
      fontSizeMicro: "0.6875rem",
    },
    radii: {
      card: "1rem",
      button: "0.75rem",
      badge: "9999px",
    },
  },
  amoled: {
    themeId: "amoled",
    colors: {
      bgBase: "#000000",
      bgSurface: "#0E0E10",
      bgRaised: "#18181B",
      bgOverlay: "rgba(0, 0, 0, 0.95)",
      borderDefault: "#27272A",
      borderHighlight: "#38BDF8",
      textPrimary: "#FFFFFF",
      textSecondary: "#A1A1AA",
      textMuted: "#71717A",
      accentGold: "#38BDF8",
      accentAmber: "#0284C7",
      statePrimary: "#0284C7",
      stateSuccess: "#22C55E",
      stateWarning: "#EAB308",
      stateError: "#EF4444",
    },
    typography: {
      fontFamily: "var(--font-geist-sans), sans-serif",
      fontSizeHero: "clamp(1.75rem, 4vw, 3rem)",
      fontSizeTitle: "clamp(1rem, 2vw, 1.35rem)",
      fontSizeBody: "0.875rem",
      fontSizeMicro: "0.6875rem",
    },
    radii: {
      card: "1rem",
      button: "0.75rem",
      badge: "9999px",
    },
  },
  cyberpunk: {
    themeId: "cyberpunk",
    colors: {
      bgBase: "#05050A",
      bgSurface: "#0D0D1A",
      bgRaised: "#16162D",
      bgOverlay: "rgba(5, 5, 10, 0.92)",
      borderDefault: "#2B1A4A",
      borderHighlight: "#00FFCC",
      textPrimary: "#00FFCC",
      textSecondary: "#FF007F",
      textMuted: "#8F7CA8",
      accentGold: "#00FFCC",
      accentAmber: "#FF007F",
      statePrimary: "#7928CA",
      stateSuccess: "#00FF66",
      stateWarning: "#FFCC00",
      stateError: "#FF0055",
    },
    typography: {
      fontFamily: "var(--font-geist-sans), sans-serif",
      fontSizeHero: "clamp(1.75rem, 4vw, 3rem)",
      fontSizeTitle: "clamp(1rem, 2vw, 1.35rem)",
      fontSizeBody: "0.875rem",
      fontSizeMicro: "0.6875rem",
    },
    radii: {
      card: "0.5rem",
      button: "0.35rem",
      badge: "0.25rem",
    },
  },
};

/**
 * Dicionário Centralizado de Rótulos, Explicações On-Demand e Tooltips
 */
export const UI_STRINGS = {
  global: {
    appName: "ANIRIUM",
    appTagline: "Metadados Canônicos, Genealogia & P2P Pessoal",
    canonicalDomain: "anirium.com.br",
    apiDomain: "api.anirium.com.br",
    serviceLocalPort: "4004",
  },
  navigation: {
    home: "Início",
    explore: "Explorar",
    calendar: "Calendário",
    franchises: "Franquias",
    searchPlaceholder: "Buscar obra, estúdio ou franquia...",
    profile: "Perfil",
    devStudio: "Addon Studio",
  },
  gamification: {
    levels: {
      0: {
        tier: 0,
        name: "Nível 0: Canônico Puro",
        badge: "Canônico",
        tooltip: "Visualização neutra de catálogo, fontes oficiais e metadados MAL/AniList.",
        icon: "ShieldCheck",
      },
      1: {
        tier: 1,
        name: "Nível 1: Membro da Comunidade",
        badge: "Membro",
        tooltip: "Sincronização de histórico, progresso de episódios e listas pessoais na nuvem.",
        icon: "UserCheck",
      },
      2: {
        tier: 2,
        name: "Nível 2: Operador Local (P2P)",
        badge: "Operador",
        tooltip: "Conexão com o service local do Windows (4004) para reprodução pessoal em tempo real.",
        icon: "Zap",
      },
      3: {
        tier: 3,
        name: "Nível 3: Desenvolvedor de Addons",
        badge: "Dev",
        tooltip: "Acesso total ao Addon Dev Studio para criação e teste de plugins de streaming e dados.",
        icon: "Terminal",
      },
    },
  },
  actions: {
    play: "Assistir",
    resume: "Continuar",
    details: "Detalhes",
    exploreFranchise: "Explorar Franquia",
    addToWatchlist: "Favoritar",
    removeFromWatchlist: "Remover Favorito",
    downloadService: "Baixar Anirium Service (.exe)",
    connectService: "Conectar Service Local",
  },
  statusBadges: {
    releasing: "Em Lançamento",
    completed: "Finalizado",
    upcoming: "Em Breve",
    movie: "Filme",
    tv: "Série",
    ova: "OVA",
  },
  sections: {
    continueWatching: "Continuar Assistindo",
    popularReleases: "Mais Populares",
    seasonalReleases: "Lançamentos da Temporada",
    upcomingReleases: "Próximos Lançamentos",
    canonicalFranchises: "Genealogia de Franquias",
  },
  badges: {
    resumed: "Histórico Ativo",
    synced: "Nuvem Sincronizada",
    local: "Local P2P",
  },
  tooltips: {
    legalBoundary: "O Anirium não hospeda vídeos. Os metadados vêm do catálogo público e a mídia é resolvida no seu serviço local.",
    parquetCache: "Catálogo carregado de fatias compactadas Zstandard com latência zero e offline-first.",
    p2pActive: "Serviço local ativo em 127.0.0.1:4004 com streaming ponta a ponta.",
    syncCloud: "Histórico sincronizado com api.anirium.com.br.",
  },
};
