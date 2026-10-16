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
  lightClean: {
    themeId: "lightClean",
    name: "Luz Solar (Clean)",
    colors: {
      bgBase: "#F8FAFC",
      bgSurface: "#FFFFFF",
      bgRaised: "#F1F5F9",
      bgOverlay: "rgba(255, 255, 255, 0.92)",
      borderDefault: "#E2E8F0",
      borderHighlight: "#D97706",
      textPrimary: "#0F172A",
      textSecondary: "#334155",
      textMuted: "#64748B",
      accentGold: "#D97706",
      accentAmber: "#F59E0B",
      statePrimary: "#2563EB",
      stateSuccess: "#16A34A",
      stateWarning: "#CA8A04",
      stateError: "#DC2626",
    },
    radii: { card: "1rem", button: "0.75rem", badge: "9999px" },
  },
  lightSakura: {
    themeId: "lightSakura",
    name: "Sakura Dia (Light)",
    colors: {
      bgBase: "#FFF5F7",
      bgSurface: "#FFFFFF",
      bgRaised: "#FFE4E9",
      bgOverlay: "rgba(255, 255, 255, 0.94)",
      borderDefault: "#FBCFE8",
      borderHighlight: "#DB2777",
      textPrimary: "#4C0519",
      textSecondary: "#831843",
      textMuted: "#9D4C6D",
      accentGold: "#DB2777",
      accentAmber: "#F472B6",
      statePrimary: "#9333EA",
      stateSuccess: "#059669",
      stateWarning: "#D97706",
      stateError: "#E11D48",
    },
    radii: { card: "1.25rem", button: "1rem", badge: "9999px" },
  },
  lightNordic: {
    themeId: "lightNordic",
    name: "Nórdico Ártico (Light)",
    colors: {
      bgBase: "#F0F4F8",
      bgSurface: "#FFFFFF",
      bgRaised: "#E1E8F0",
      bgOverlay: "rgba(255, 255, 255, 0.93)",
      borderDefault: "#CBD5E1",
      borderHighlight: "#0284C7",
      textPrimary: "#0F2942",
      textSecondary: "#1E3A5F",
      textMuted: "#526E8C",
      accentGold: "#0284C7",
      accentAmber: "#0EA5E9",
      statePrimary: "#0284C7",
      stateSuccess: "#10B981",
      stateWarning: "#F59E0B",
      stateError: "#EF4444",
    },
    radii: { card: "0.75rem", button: "0.5rem", badge: "9999px" },
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
    loginWithGoogle: string;
    logout: string;
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
    worksCount: string;
    franchiseSubheader: string;
    franchiseFooterNote: string;
    calendarTrackTitle: string;
    exploreDescription: string;
    calendarDescription: string;
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
      loginWithGoogle: "Entrar com Google",
      logout: "Sair da Conta",
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
      worksCount: "Obras",
      franchiseSubheader: "Grafo Genealógico Reativo",
      franchiseFooterNote: "Navegação contínua sem recarregar páginas",
      calendarTrackTitle: "Transmissões e Lançamentos Ordenados",
      exploreDescription: "Filtro em tempo real sobre o Catálogo Universal indexado.",
      calendarDescription: "Filtro cronológico derivado do catálogo universal por ano e temporadas de transmissão.",
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
      loginWithGoogle: "Sign in with Google",
      logout: "Sign Out",
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
      worksCount: "Titles",
      franchiseSubheader: "Reactive Genealogic Graph",
      franchiseFooterNote: "Seamless continuous navigation without page reloads",
      calendarTrackTitle: "Chronological Airings and Premieres",
      exploreDescription: "Real-time query over the indexed Universal Catalog.",
      calendarDescription: "Chronological filter projected from universal catalog by broadcast year and season.",
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
      loginWithGoogle: "Googleでログイン",
      logout: "ログアウト",
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
      worksCount: "作品",
      franchiseSubheader: "リアクティブ系譜グラフ",
      franchiseFooterNote: "ページ再読込なしのシームレス体験",
      calendarTrackTitle: "放送順・公開順タイムライン",
      exploreDescription: "統合ユニバーサルカタログからのリアルタイム抽出。",
      calendarDescription: "年度とクール別の時間軸フィルタリング。",
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
      loginWithGoogle: "Iniciar con Google",
      logout: "Cerrar Sesión",
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
      worksCount: "Obras",
      franchiseSubheader: "Grafo Genealógico Reactivo",
      franchiseFooterNote: "Navegación continua sin recargar página",
      calendarTrackTitle: "Emisiones y Estrenos Ordenados",
      exploreDescription: "Filtro en tiempo real sobre el Catálogo Universal indexado.",
      calendarDescription: "Filtro cronológico proyectado por año y temporada de emisión.",
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
      loginWithGoogle: "Se connecter avec Google",
      logout: "Déconnexion",
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
      worksCount: "Œuvres",
      franchiseSubheader: "Graphe Généalogique Réactif",
      franchiseFooterNote: "Navigation continue sans rechargement de page",
      calendarTrackTitle: "Diffusions et Sorties Ordonnées",
      exploreDescription: "Filtrage en temps réel sur le Catalogue Universel indexé.",
      calendarDescription: "Filtre chronologique projeté par année et saisons de diffusion.",
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
      loginWithGoogle: "Mit Google Anmelden",
      logout: "Abmelden",
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
      worksCount: "Werke",
      franchiseSubheader: "Reaktiver Genealogischer Graph",
      franchiseFooterNote: "Nahtlose Navigation ohne Neuladen der Seite",
      calendarTrackTitle: "Chronologische Ausstrahlungen und Premieren",
      exploreDescription: "Echtzeit-Filterung über den indizierten universellen Katalog.",
      calendarDescription: "Chronologischer Filter nach Jahr und Ausstrahlungszeiten.",
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
 * Dicionário canônico multi-língua de sinopses para animes de alta popularidade
 */
export const LOCALIZED_SYNOPSIS_MAP: Record<string, Record<SupportedLanguage, string>> = {
  "Shingeki no Kyojin": {
    "pt-BR": "A humanidade vive cercada por muralhas gigantescas para se proteger de Titãs devoradores. Quando a muralha é rompida, Eren Yeager jura exterminar todos os Titãs.",
    "en-US": "Humanity lives enclosed within enormous walls to protect themselves from man-eating Titans. When the wall falls, Eren Yeager vows to eradicate every Titan.",
    "ja-JP": "巨人がすべてを支配する世界。巨人の餌と化した人類は、巨大な三重の壁を築き平和を保っていた。壁が崩壊した日、エレン・イェーガーは巨人の駆逐を誓う。",
    "es-ES": "La humanidad vive confinada dentro de enormes murallas para protegerse de titanes carnívoros. Cuando el muro cae, Eren Yeager jura erradicar a todos los titanes.",
    "fr-FR": "L'humanité vit retranchée derrière d'immenses murs pour se protéger des Titans mangeurs d'hommes. Eren Jäger jure d'éliminer jusqu'au dernier Titan.",
    "de-DE": "Die Menschheit lebt hinter riesigen Mauern vor menschenfressenden Titanen. Als die Mauer fällt, schwört Eren Jäger, jeden einzelnen Titanen auszulöschen.",
  },
  "Kimetsu no Yaiba": {
    "pt-BR": "Tanjiro Kamado tem sua família massacrada por demônios e sua irmã transformada em uma criatura. Ele se une aos Caçadores de Demônios para devolvê-la à humanidade.",
    "en-US": "Tanjiro Kamado's family is slaughtered by demons and his sister transformed into one. He joins the Demon Slayer Corps to find a cure and make her human again.",
    "ja-JP": "炭を売る心優しき少年・炭治郎の日常は、家族を鬼に皆殺しにされたことで一変する。鬼となった妹・禰豆子を救うため、鬼殺隊の門を叩く。",
    "es-ES": "La familia de Tanjiro Kamado es masacrada por demonios y su hermana se convierte en uno. Se une al Cuerpo de Exterminio para buscar una cura.",
    "fr-FR": "La famille de Tanjiro Kamado est massacrée par des démons et sa sœur devient l'un d'eux. Il rejoint les Pourfendeurs de démons pour la sauver.",
    "de-DE": "Tanjiro Kamados Familie wird von Dämonen getötet und seine Schwester verwandelt. Er tritt den Dämonenjägern bei, um ein Heilmittel zu finden.",
  },
  "Boku no Hero Academia": {
    "pt-BR": "Num mundo onde 80% da população possui superpoderes ('Individualidades'), o garoto sem poderes Izuku Midoriya herda a força do maior herói de todos, All Might.",
    "en-US": "In a world where 80% of humanity possesses superpowers ('Quirks'), powerless boy Izuku Midoriya inherits the power of the greatest hero, All Might.",
    "ja-JP": "人口の約8割が超常能力『個性』を持つ世界。無個性の少年・緑谷出久が、憧れのNo.1ヒーロー・オールマイトから力を受け継ぎ最高のヒーローを目指す。",
    "es-ES": "En un mundo donde la mayoría tiene superpoderes ('Dones'), el chico sin poderes Izuku Midoriya hereda el poder del mayor héroe, All Might.",
    "fr-FR": "Dans un monde où 80% des gens ont des super-pouvoirs ('Alters'), le jeune sans pouvoir Izuku Midoriya hérite de la force d'All Might.",
    "de-DE": "In einer Welt voller Superkräfte ('Macken') erbt der machtlose Junge Izuku Midoriya die Kraft des größten Helden, All Might.",
  },
  "One Punch Man": {
    "pt-BR": "Saitama treinou tanto que perdeu os cabelos e ficou tão forte que derrota qualquer adversário com apenas um soco, vivendo em busca de um verdadeiro desafio.",
    "en-US": "Saitama trained so hard he lost his hair and became capable of defeating any enemy with a single punch, leaving him endlessly bored in search of a real challenge.",
    "ja-JP": "趣味でヒーローを始めた男・サイタマ。3年間の特訓により無敵の力を手に入れたが、あまりに強すぎてどんな強敵もワンパンチで倒してしまう。",
    "es-ES": "Saitama entrenó tanto que se quedó calvo y ahora vence a cualquier rival de un solo golpe, buscando desesperadamente un rival digno.",
    "fr-FR": "Saitama s'est tellement entraîné qu'il en a perdu ses cheveux et terrasse n'importe quel ennemi d'un seul coup de poing, en quête perpétuelle d'un rival.",
    "de-DE": "Saitama hat so hart trainiert, dass er seine Haare verlor und jeden Gegner mit einem einzigen Schlag besiegt – stets auf der Suche nach einem echten Kampf.",
  },
  "Jujutsu Kaisen": {
    "pt-BR": "Yuji Itadori engole o dedo de Ryomen Sukuna, o Rei das Maldições, e entra para a Escola de Feitiçaria de Tóquio para controlar seu poder e salvar vidas.",
    "en-US": "Yuji Itadori swallows the cursed finger of Ryomen Sukuna, King of Curses, and joins Tokyo Jujutsu High to harness cursed energy and save innocent lives.",
    "ja-JP": "類稀な身体能力を持つ高校生・虎杖悠仁は、呪物の封印を解かれた仲間を救うため特級呪物「両面宿儺の指」を呑み込み、呪術高等専門学校へ進む。",
    "es-ES": "Yuji Itadori traga un dedo maldito de Ryomen Sukuna, Rey de las Maldiciones, e ingresa a la Escuela Técnica de Hechicería de Tokio para salvar vidas.",
    "fr-FR": "Yuji Itadori avale un doigt maudit de Ryomen Sukuna, Roi des Fléaux, et rejoint l'école d'exorcisme de Tokyo pour protéger les innocents.",
    "de-DE": "Yuji Itadori verschluckt den verfluchten Finger von Ryomen Sukuna, dem König der Flüche, und tritt der Jujutsu-Akademie Tokio bei.",
  },
  "Solo Leveling": {
    "pt-BR": "Sung Jin-woo, o caçador mais fraco da humanidade, sobrevive a uma masmorra dupla mortal e desperta com uma interface secreta que lhe permite evoluir sem limites.",
    "en-US": "Sung Jin-woo, known as the weakest hunter, survives a deadly double dungeon and awakens with a mysterious gaming interface that allows him to level up infinitely.",
    "ja-JP": "人類最弱兵器と呼ばれるE級ハンター・水篠旬。二重ダンジョンで死の淵に立った彼にだけ見える謎のクエストウィンドウが開き、無限の成長が始まる。",
    "es-ES": "Sung Jin-woo, el cazador más débil, sobrevive a una letal mazmorra doble y despierta con una interfaz de juego misteriosa que le permite subir de nivel.",
    "fr-FR": "Sung Jin-woo, le plus faible des chasseurs, survit à un donjon fatal et reçoit une interface de jeu secrète lui permettant d'augmenter ses niveaux à l'infini.",
    "de-DE": "Sung Jin-woo, der schwächste Jäger, überlebt einen tödlichen Kerker und erhält eine geheime Spieloberfläche, die es ihm erlaubt, grenzenlos aufzusteigen.",
  },
  "Sousou no Frieren": {
    "pt-BR": "Após derrotar o Rei Demônio com seu grupo, a elfa maga quase imortal Frieren parte em uma nova jornada para compreender os sentimentos humanos e as despedidas.",
    "en-US": "After defeating the Demon King with the hero party, long-lived elf mage Frieren embarks on a new journey to understand the brevity and warmth of human life.",
    "ja-JP": "魔王を倒した勇者一行の後日譚。千年以上生きるエルフの魔法使いフリーレンが、かつて共に旅した仲間たちの死を経て、人間を知るための旅に出る。",
    "es-ES": "Tras vencer al Rey Demonio, la elfa maga Frieren emprende un nuevo viaje para comprender la vida humana y los recuerdos que dejaron sus compañeros.",
    "fr-FR": "Après la défaite du Roi Démon, la magicienne elfe Frieren entreprend un nouveau voyage pour mieux comprendre l'éphémère existence des humains.",
    "de-DE": "Nach dem Sieg über den Dämonenkönig begibt sich die langlebige Elfenmagierin Frieren auf eine Reise, um die Vergänglichkeit des menschlichen Lebens zu verstehen.",
  },
  "Kusuriya no Hitorigoto": {
    "pt-BR": "Maomao, uma jovem apotecária sequestrada e vendida para o palácio imperial, usa sua perspicácia farmacológica e paixão por venenos para solucionar mistérios da corte.",
    "en-US": "Maomao, a young apothecary sold into servitude at the imperial palace, uses her sharp deduction and deep herbal knowledge to solve deadly palace intrigues.",
    "ja-JP": "花街で薬師をしていた少女・猫猫。後宮に下女として売られるも、持ち前の薬学と毒への好奇心で皇室の不可解な事件や陰謀を次々と解き明かす。",
    "es-ES": "Maomao, una joven boticaria vendida al palacio imperial, emplea su ingenio farmacéutico y fascinación por los venenos para resolver misterios cortesanos.",
    "fr-FR": "Maomao, une jeune apothicaire vendue au palais impérial, met ses connaissances des herbes et des poisons au service de la résolution d'énigmes de cour.",
    "de-DE": "Maomao, eine junge Apothekerin im kaiserlichen Palast, nutzt ihr pharmazeutisches Wissen und ihre Neugier auf Gifte, um Hofgeheimnisse zu lüften.",
  },
  "Chainsaw Man": {
    "pt-BR": "Denji vive na miséria pagando dívidas da máfia com seu demônio Pochita. Traído e assassinado, ele renasce como o lendário Chainsaw Man com motosserras no corpo.",
    "en-US": "Denji lives in poverty paying off mafia debts alongside devil dog Pochita. Betrayed and killed, he is revived as Chainsaw Man with roaring blades.",
    "ja-JP": "デビルハンターとして借金返済に追われる少年・デンジ。裏切りに遭い惨殺されるも、チェンソーの悪魔ポチタと契約し『チェンソーマン』として蘇る。",
    "es-ES": "Denji vive en la miseria pagando deudas mafiosas con su perro demonio Pochita. Asesinado a traición, renace como Chainsaw Man con sierras en su cuerpo.",
    "fr-FR": "Denji vit dans la misère jusqu'à ce qu'il soit trahi et tué. Ressuscité par son démon Pochita, il devient Chainsaw Man aux lames tronçonneuses.",
    "de-DE": "Denji lebt in bitterer Armut mit seinem Teufelshund Pochita. Nach einem Verrat wiederbelebt, erwacht er als furchterregender Chainsaw Man.",
  },
  "Tokyo Revengers": {
    "pt-BR": "Takemichi Hanagaki descobre que sua ex-namorada foi morta pela gangue Manji. Ele salta 12 anos no tempo até seus dias de escola para alterar o destino e salvá-la.",
    "en-US": "Takemichi Hanagaki travels 12 years back to his middle school days to infiltrate the Tokyo Manji Gang and prevent the future murder of his girlfriend.",
    "ja-JP": "どん底の生活を送る花垣武道は、中学時代の彼女が暴走族『東京卍會』の抗争で死亡したと知る。突如12年前にタイムリープし、運命を変える戦いに挑む。",
    "es-ES": "Takemichi Hanagaki viaja 12 años al pasado hasta la secundaria para infiltrarse en la Tokyo Manji Gang y evitar el asesinato de su novia de la infancia.",
    "fr-FR": "Takemichi Hanagaki fait un bond de 12 ans dans le passé pour infiltrer le gang Tokyo Manji et empêcher le futur meurtre de son ancienne petite amie.",
    "de-DE": "Takemichi Hanagaki reist 12 Jahre in seine Schulzeit zurück, um die Tokyo Manji Gang zu infiltrieren und den Mord an seiner Jugendliebe zu verhindern.",
  },
};

/**
 * Função Pura de Casca Branca para Resolução Instantânea de Títulos por Idioma
 */
export function getLocalizedTitle(anime: any, lang: SupportedLanguage): string {
  if (!anime) return "";
  if (lang === "ja-JP" && anime.title_japanese) return anime.title_japanese;
  if (lang === "pt-BR" && anime.title_portuguese) return anime.title_portuguese;
  if (lang === "es-ES" && anime.title_spanish) return anime.title_spanish;
  if (lang === "fr-FR" && anime.title_french) return anime.title_french;
  if (lang === "de-DE" && anime.title_german) return anime.title_german;
  if (lang === "en-US" && anime.title_english) return anime.title_english;
  return anime.title || anime.title_english || anime.title_japanese || "Anime";
}

/**
 * Função Pura de Casca Branca para Resolução Instantânea de Sinopses por Idioma
 */
export function getLocalizedSynopsis(anime: any, lang: SupportedLanguage): string {
  if (!anime) return "";
  
  // 1. Dicionário explícito anexado na própria obra
  if (anime.synopses && anime.synopses[lang]) {
    return anime.synopses[lang];
  }
  
  // 2. Colunas de idioma explícito do registro
  if (lang === "pt-BR" && anime.synopsis_portuguese) return anime.synopsis_portuguese;
  if (lang === "ja-JP" && anime.synopsis_japanese) return anime.synopsis_japanese;
  if (lang === "es-ES" && anime.synopsis_spanish) return anime.synopsis_spanish;
  if (lang === "fr-FR" && anime.synopsis_french) return anime.synopsis_french;
  if (lang === "de-DE" && anime.synopsis_german) return anime.synopsis_german;

  // 3. Mapeamento canônico universal por título ou título em inglês
  const lookupKey = anime.title || anime.title_english;
  if (lookupKey && LOCALIZED_SYNOPSIS_MAP[lookupKey] && LOCALIZED_SYNOPSIS_MAP[lookupKey][lang]) {
    return LOCALIZED_SYNOPSIS_MAP[lookupKey][lang];
  }
  if (anime.title_english && LOCALIZED_SYNOPSIS_MAP[anime.title_english] && LOCALIZED_SYNOPSIS_MAP[anime.title_english][lang]) {
    return LOCALIZED_SYNOPSIS_MAP[anime.title_english][lang];
  }

  // 4. Retorna a sinopse original se for inglês ou se existir
  if (anime.synopsis && (lang === "en-US" || !lang)) {
    return anime.synopsis;
  }

  // 5. Fallback regionalizado limpo no idioma ativo caso o registro bruto seja apenas em inglês
  const genericFallback: Record<SupportedLanguage, string> = {
    "pt-BR": anime.synopsis || "Exploração canônica de catálogo streaming em alta definição.",
    "en-US": anime.synopsis || "Canonical anime catalog exploration in high definition.",
    "ja-JP": "公式ストリーミングカタログによる高解像度アニメ視聴体験。",
    "es-ES": "Exploración canónica de catálogo anime en alta definición.",
    "fr-FR": "Exploration canonique du catalogue d'anime en haute définition.",
    "de-DE": "Kanonische Erkundung des Anime-Katalogs in High Definition.",
  };

  return genericFallback[lang] || anime.synopsis || "Anirium Streaming";
}

