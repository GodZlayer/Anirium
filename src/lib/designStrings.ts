/**
 * Central de Strings, Tokens Visuais e Dicionário Multi-Línguas (TGCode Standard)
 * 100% Stringado com 0 Hardcode no frontend.
 * Suporta 6 Idiomas Canônicos:
 * - pt-BR: Português do Brasil
 * - en-US: English
 * - ja-JP: 日本語 (Nativo / Kanji)
 * - es-ES: Español
 * - fr-FR: Français
 * - de-DE: Deutsch
 * 
 * 4 Temas Completos com Tokens Reativos:
 * - black: Dark Clássico (Âmbar/Dourado)
 * - amoled: AMOLED Puro (Preto Absoluto #000 + Sky Blue)
 * - cyberpunk: Neon Cyberpunk (Roxo Profundo #05050A + Cyan #00FFCC + Pink #FF007F)
 * - sakura: Sakura Night (Violeta Escuro #0F0A15 + Sakura Rosa #FFB7C5)
 */

export type SupportedLanguage = "pt-BR" | "en-US" | "ja-JP" | "es-ES" | "fr-FR" | "de-DE";

export interface DesignTokens {
  themeId: string;
  name: string;
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
  radii: {
    card: string;
    button: string;
    badge: string;
  };
}

export const THEME_PALETTES: Record<string, DesignTokens> = {
  black: {
    themeId: "black",
    name: "Dark Clássico",
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
    radii: { card: "1rem", button: "0.75rem", badge: "9999px" },
  },
  amoled: {
    themeId: "amoled",
    name: "AMOLED Puro",
    colors: {
      bgBase: "#000000",
      bgSurface: "#0C0C0E",
      bgRaised: "#16161A",
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
    radii: { card: "1rem", button: "0.75rem", badge: "9999px" },
  },
  cyberpunk: {
    themeId: "cyberpunk",
    name: "Cyberpunk Neon",
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
    radii: { card: "0.5rem", button: "0.35rem", badge: "0.25rem" },
  },
  sakura: {
    themeId: "sakura",
    name: "Sakura Night",
    colors: {
      bgBase: "#0D0814",
      bgSurface: "#191024",
      bgRaised: "#251836",
      bgOverlay: "rgba(13, 8, 20, 0.90)",
      borderDefault: "#3D2452",
      borderHighlight: "#FFB7C5",
      textPrimary: "#FFF0F5",
      textSecondary: "#F4C2C2",
      textMuted: "#A389A8",
      accentGold: "#FFB7C5",
      accentAmber: "#FF69B4",
      statePrimary: "#BA55D3",
      stateSuccess: "#3CB371",
      stateWarning: "#FFA500",
      stateError: "#FF4500",
    },
    radii: { card: "1.25rem", button: "1rem", badge: "9999px" },
  },
};

export interface LocaleStrings {
  navigation: {
    home: string;
    explore: string;
    calendar: string;
    franchises: string;
    searchPlaceholder: string;
    profile: string;
    searchResults: string;
  };
  actions: {
    play: string;
    resume: string;
    details: string;
    viewEpisodes: string;
    closeEpisodes: string;
    addToFavorites: string;
    removeFromFavorites: string;
    back: string;
    save: string;
    cancel: string;
  };
  labels: {
    season: string;
    episode: string;
    chronology: string;
    format: string;
    year: string;
    score: string;
    selectAnimeFromTrack: string;
    releasing: string;
    completed: string;
    upcoming: string;
    highlightTitle: string;
    exploreTitle: string;
    calendarTitle: string;
    franchiseMapTitle: string;
    themesLabel: string;
    languagesLabel: string;
    levelLabel: string;
    xpToNext: string;
  };
  tiers: {
    guest: string;
    member: string;
    plus: string;
    admin: string;
  };
}

export const I18N_DICTIONARY: Record<SupportedLanguage, LocaleStrings> = {
  "pt-BR": {
    navigation: {
      home: "Início",
      explore: "Explorar",
      calendar: "Calendário",
      franchises: "Franquias",
      searchPlaceholder: "Buscar obra, estúdio ou franquia...",
      profile: "Perfil",
      searchResults: "RESULTADOS DA BUSCA",
    },
    actions: {
      play: "Assistir",
      resume: "Continuar",
      details: "Detalhes",
      viewEpisodes: "Ver Episódios",
      closeEpisodes: "Fechar Episódios",
      addToFavorites: "Favoritar Obra",
      removeFromFavorites: "Remover dos Favoritos",
      back: "Voltar",
      save: "Salvar",
      cancel: "Cancelar",
    },
    labels: {
      season: "Temporada",
      episode: "Episódio",
      chronology: "CRONOLOGIA DE EPISÓDIOS",
      format: "SÉRIE TV",
      year: "Canônico",
      score: "Nota Canônica",
      selectAnimeFromTrack: "SELECIONE UMA OBRA NA ESTEIRA",
      releasing: "Em Lançamento",
      completed: "Finalizado",
      upcoming: "Em Breve",
      highlightTitle: "Destaques Canônicos",
      exploreTitle: "EXPLORAÇÃO DE CATÁLOGO PARQUET",
      calendarTitle: "AGENDA CANÔNICA DE TRANSMISSÃO",
      franchiseMapTitle: "MAPA ORBITAL DE FRANQUIAS",
      themesLabel: "Temas",
      languagesLabel: "Idioma",
      levelLabel: "Nível",
      xpToNext: "para o próximo nível",
    },
    tiers: {
      guest: "Visitante",
      member: "Membro",
      plus: "Anirium+",
      admin: "Admin",
    },
  },
  "en-US": {
    navigation: {
      home: "Home",
      explore: "Explore",
      calendar: "Calendar",
      franchises: "Franchises",
      searchPlaceholder: "Search anime, studio or franchise...",
      profile: "Profile",
      searchResults: "SEARCH RESULTS",
    },
    actions: {
      play: "Watch",
      resume: "Resume",
      details: "Details",
      viewEpisodes: "View Episodes",
      closeEpisodes: "Close Episodes",
      addToFavorites: "Add to Favorites",
      removeFromFavorites: "Remove Favorite",
      back: "Back",
      save: "Save",
      cancel: "Cancel",
    },
    labels: {
      season: "Season",
      episode: "Episode",
      chronology: "EPISODE CHRONOLOGY",
      format: "TV SERIES",
      year: "Canonical",
      score: "Canonical Score",
      selectAnimeFromTrack: "SELECT AN ANIME ON THE TRACK",
      releasing: "Airing",
      completed: "Completed",
      upcoming: "Upcoming",
      highlightTitle: "Canonical Highlights",
      exploreTitle: "PARQUET CATALOG EXPLORATION",
      calendarTitle: "CANONICAL BROADCAST SCHEDULE",
      franchiseMapTitle: "ORBITAL FRANCHISE MAP",
      themesLabel: "Themes",
      languagesLabel: "Language",
      levelLabel: "Level",
      xpToNext: "to next level",
    },
    tiers: {
      guest: "Guest",
      member: "Member",
      plus: "Anirium+",
      admin: "Admin",
    },
  },
  "ja-JP": {
    navigation: {
      home: "ホーム",
      explore: "探索",
      calendar: "放送予定",
      franchises: "シリーズ系譜",
      searchPlaceholder: "作品、スタジオ、シリーズを検索...",
      profile: "プロフィール",
      searchResults: "検索結果",
    },
    actions: {
      play: "再生する",
      resume: "続きから再生",
      details: "詳細情報",
      viewEpisodes: "エピソード一覧",
      closeEpisodes: "閉じる",
      addToFavorites: "お気に入りに追加",
      removeFromFavorites: "お気に入り解除",
      back: "戻る",
      save: "保存",
      cancel: "キャンセル",
    },
    labels: {
      season: "期",
      episode: "話",
      chronology: "エピソード年表",
      format: "テレビアニメ",
      year: "公式放送",
      score: "公式評価",
      selectAnimeFromTrack: "トラックから作品を選択してください",
      releasing: "放送中",
      completed: "完結",
      upcoming: "放送予定",
      highlightTitle: "注目の公式作品",
      exploreTitle: "Parquetカタログ探索",
      calendarTitle: "公式放送スケジュール",
      franchiseMapTitle: "シリーズ軌道マップ",
      themesLabel: "テーマ",
      languagesLabel: "言語",
      levelLabel: "レベル",
      xpToNext: "次のレベルまで",
    },
    tiers: {
      guest: "ゲスト",
      member: "メンバー",
      plus: "Anirium+",
      admin: "管理者",
    },
  },
  "es-ES": {
    navigation: {
      home: "Inicio",
      explore: "Explorar",
      calendar: "Calendario",
      franchises: "Franquicias",
      searchPlaceholder: "Buscar anime, estudio o franquicia...",
      profile: "Perfil",
      searchResults: "RESULTADOS DE LA BÚSQUEDA",
    },
    actions: {
      play: "Reproducir",
      resume: "Continuar",
      details: "Detalles",
      viewEpisodes: "Ver Episodios",
      closeEpisodes: "Cerrar Episodios",
      addToFavorites: "Añadir a Favoritos",
      removeFromFavorites: "Quitar de Favoritos",
      back: "Volver",
      save: "Guardar",
      cancel: "Cancelar",
    },
    labels: {
      season: "Temporada",
      episode: "Episodio",
      chronology: "CRONOLOGÍA DE EPISODIOS",
      format: "SERIE TV",
      year: "Canónico",
      score: "Puntuación Canónica",
      selectAnimeFromTrack: "SELECCIONA UNA OBRA EN LA PISTA",
      releasing: "En Emisión",
      completed: "Finalizado",
      upcoming: "Próximamente",
      highlightTitle: "Destacados Canónicos",
      exploreTitle: "EXPLORACIÓN DE CATÁLOGO PARQUET",
      calendarTitle: "CALENDARIO CANÓNICO DE EMISIÓN",
      franchiseMapTitle: "MAPA ORBITAL DE FRANQUICIAS",
      themesLabel: "Temas",
      languagesLabel: "Idioma",
      levelLabel: "Nivel",
      xpToNext: "para el próximo nivel",
    },
    tiers: {
      guest: "Invitado",
      member: "Miembro",
      plus: "Anirium+",
      admin: "Admin",
    },
  },
  "fr-FR": {
    navigation: {
      home: "Accueil",
      explore: "Explorer",
      calendar: "Calendrier",
      franchises: "Franchises",
      searchPlaceholder: "Rechercher un anime, studio ou franchise...",
      profile: "Profil",
      searchResults: "RÉSULTATS DE RECHERCHE",
    },
    actions: {
      play: "Regarder",
      resume: "Reprendre",
      details: "Détails",
      viewEpisodes: "Voir les Épisodes",
      closeEpisodes: "Fermer les Épisodes",
      addToFavorites: "Ajouter aux Favoris",
      removeFromFavorites: "Retirer des Favoris",
      back: "Retour",
      save: "Enregistrer",
      cancel: "Annuler",
    },
    labels: {
      season: "Saison",
      episode: "Épisode",
      chronology: "CHRONOLOGIE DES ÉPISODES",
      format: "SÉRIE TV",
      year: "Canonique",
      score: "Note Canonique",
      selectAnimeFromTrack: "SÉLECTIONNEZ UNE ŒUVRE SUR LA PISTE",
      releasing: "En Cours",
      completed: "Terminé",
      upcoming: "À Venir",
      highlightTitle: "Sélections Canoniques",
      exploreTitle: "EXPLORATION DU CATALOGUE PARQUET",
      calendarTitle: "CALENDRIER CANONIQUE DE DIFFUSION",
      franchiseMapTitle: "CARTE ORBITALE DES FRANCHISES",
      themesLabel: "Thèmes",
      languagesLabel: "Langue",
      levelLabel: "Niveau",
      xpToNext: "vers le niveau suivant",
    },
    tiers: {
      guest: "Invité",
      member: "Membre",
      plus: "Anirium+",
      admin: "Admin",
    },
  },
  "de-DE": {
    navigation: {
      home: "Startseite",
      explore: "Erkunden",
      calendar: "Kalender",
      franchises: "Franchises",
      searchPlaceholder: "Anime, Studio oder Franchise suchen...",
      profile: "Profil",
      searchResults: "SUCHERGEBNISSE",
    },
    actions: {
      play: "Ansehen",
      resume: "Fortsetzen",
      details: "Details",
      viewEpisodes: "Episoden Anzeigen",
      closeEpisodes: "Episoden Schließen",
      addToFavorites: "Zu Favoriten Hinzufügen",
      removeFromFavorites: "Aus Favoriten Entfernen",
      back: "Zurück",
      save: "Speichern",
      cancel: "Abbrechen",
    },
    labels: {
      season: "Staffel",
      episode: "Folge",
      chronology: "EPISODEN-CHRONOLOGIE",
      format: "TV-SERIE",
      year: "Kanonisch",
      score: "Kanonische Bewertung",
      selectAnimeFromTrack: "WÄHLEN SIE EIN WERK AUS DER LEISTE",
      releasing: "Laufend",
      completed: "Abgeschlossen",
      upcoming: "Demnächst",
      highlightTitle: "Kanonische Highlights",
      exploreTitle: "PARQUET-KATALOG ERKUNDUNG",
      calendarTitle: "KANONISCHER SENDEPLAN",
      franchiseMapTitle: "ORBITALE FRANCHISE-KARTE",
      themesLabel: "Themen",
      languagesLabel: "Sprache",
      levelLabel: "Level",
      xpToNext: "bis zum nächsten Level",
    },
    tiers: {
      guest: "Gast",
      member: "Mitglied",
      plus: "Anirium+",
      admin: "Admin",
    },
  },
};

/**
 * Função Pura de Casca Branca para Resolução Instantânea de Títulos por Idioma
 */
export function getLocalizedTitle(anime: any, lang: SupportedLanguage): string {
  if (!anime) return "";
  if (lang === "ja-JP" && anime.title_japanese) return anime.title_japanese;
  if (lang === "pt-BR" && anime.title_portuguese) return anime.title_portuguese;
  if (lang === "en-US" && anime.title_english) return anime.title_english;
  return anime.title || anime.title_english || anime.title_japanese || "Anime";
}
