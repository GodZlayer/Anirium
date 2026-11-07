/**
 * Registro de Relações Canônicas de Universos do Anirium (MAL-Inspired)
 * Base determinística para mapeamento ontológico de universos e suas produções.
 *
 * Categorias MAL:
 * - MAIN_SERIES: Produção de TV / backbone da história principal (Canônica)
 * - SEQUEL: Continuação direta da narrativa principal (Canônica)
 * - PREQUEL: Prólogo ou história anterior canônica (Canônica)
 * - CANON_MOVIE: Longa-metragem que é parte oficial da linha temporal (1 ep longo)
 * - MOVIE: Filme paralelo / side story não obrigatória
 * - ALT_ADAPTATION: Outra adaptação da mesma história (ex: FMA 2003)
 * - SPIN_OFF: Obra derivada no mesmo cosmos (ex: Burn the Witch, Rock Lee)
 * - SPECIAL: Especial, OVA, Recap, Omake de eventos
 */

export type UniverseRelationType =
  | "MAIN_SERIES"
  | "SEQUEL"
  | "PREQUEL"
  | "CANON_MOVIE"
  | "MOVIE"
  | "ALT_ADAPTATION"
  | "SPIN_OFF"
  | "SPECIAL";

export interface UniverseWorkClassification {
  relationType: UniverseRelationType;
  label: string;
  isCanon: boolean;
  bg: string;
  border: string;
  text: string;
  saga?: string;
  universeId: string;
}

// Mapa explícito de obras canônicas com papéis conhecidos no MAL
export const KNOWN_CANONICAL_WORKS: Record<number, { relationType: UniverseRelationType; universeId: string; label?: string; saga?: string }> = {
  // BLEACH COSMOS
  269: { relationType: "MAIN_SERIES", universeId: "bleach", label: "Série Clássica (2004)", saga: "Saga dos Shinigamis" },
  41467: { relationType: "SEQUEL", universeId: "bleach", label: "A Guerra dos Mil Anos (Cour 1)", saga: "TYBW" },
  53998: { relationType: "SEQUEL", universeId: "bleach", label: "A Guerra dos Mil Anos (Cour 2)", saga: "TYBW" },
  56784: { relationType: "SEQUEL", universeId: "bleach", label: "A Guerra dos Mil Anos (Cour 3)", saga: "TYBW" },
  60636: { relationType: "SEQUEL", universeId: "bleach", label: "A Guerra dos Mil Anos (Cour 4)", saga: "TYBW" },
  1686: { relationType: "MOVIE", universeId: "bleach", label: "Filme 1: Memories of Nobody" },
  2889: { relationType: "MOVIE", universeId: "bleach", label: "Filme 2: The DiamondDust Rebellion" },
  4835: { relationType: "MOVIE", universeId: "bleach", label: "Filme 3: Fade to Black" },
  8247: { relationType: "MOVIE", universeId: "bleach", label: "Filme 4: Jigoku-hen (Hell Verse)" },
  41468: { relationType: "SPIN_OFF", universeId: "bleach", label: "Burn the Witch (Ramo Ocidental)" },
  56671: { relationType: "SPIN_OFF", universeId: "bleach", label: "Burn the Witch #0.8" },
  762: { relationType: "SPECIAL", universeId: "bleach", label: "Especial: Memories in the Rain" },
  834: { relationType: "SPECIAL", universeId: "bleach", label: "Especial: The Sealed Sword Frenzy" },

  // NARUTO & BORUTO COSMOS
  20: { relationType: "MAIN_SERIES", universeId: "naruto", label: "Naruto Clássico (2002)", saga: "Naruto Clássico" },
  1735: { relationType: "SEQUEL", universeId: "naruto", label: "Naruto Shippuden (2007)", saga: "Shippuden" },
  16870: { relationType: "CANON_MOVIE", universeId: "naruto", label: "The Last: Naruto the Movie (Epílogo Canônico)", saga: "Epílogo Shippuden" },
  34566: { relationType: "SEQUEL", universeId: "naruto", label: "Boruto: Naruto Next Generations", saga: "Nova Geração" },
  54687: { relationType: "SEQUEL", universeId: "naruto", label: "Boruto: Two Blue Vortex (Part 2)", saga: "Nova Geração" },
  28755: { relationType: "CANON_MOVIE", universeId: "naruto", label: "Boruto: The Movie", saga: "Exames Chunin Nova Era" },
  12979: { relationType: "SPIN_OFF", universeId: "naruto", label: "Rock Lee & His Ninja Pals (Spin-off Paródia)" },
  442: { relationType: "MOVIE", universeId: "naruto", label: "Filme 1: O Resgate da Princesa da Neve" },
  936: { relationType: "MOVIE", universeId: "naruto", label: "Filme 2: A Lenda da Pedra de Gelel" },
  2144: { relationType: "MOVIE", universeId: "naruto", label: "Filme 3: Guardiões do Reino da Lua Crescente" },
  2472: { relationType: "MOVIE", universeId: "naruto", label: "Shippuden Filme 1: A Morte de Naruto" },
  4437: { relationType: "MOVIE", universeId: "naruto", label: "Shippuden Filme 2: Laços (Kizuna)" },
  6325: { relationType: "MOVIE", universeId: "naruto", label: "Shippuden Filme 3: Herdeiros da Vontade do Fogo" },
  8246: { relationType: "MOVIE", universeId: "naruto", label: "Shippuden Filme 4: A Torre Perdida" },
  10589: { relationType: "MOVIE", universeId: "naruto", label: "Shippuden Filme 5: Prisão de Sangue" },
  13667: { relationType: "MOVIE", universeId: "naruto", label: "Shippuden Filme 6: Road to Ninja" },

  // FULLMETAL ALCHEMIST COSMOS
  5114: { relationType: "MAIN_SERIES", universeId: "fma", label: "Fullmetal Alchemist: Brotherhood (Fiel ao Mangá)", saga: "Brotherhood" },
  121: { relationType: "ALT_ADAPTATION", universeId: "fma", label: "Fullmetal Alchemist 2003 (Adaptação Alternativa)", saga: "Clássico 2003" },
  430: { relationType: "MOVIE", universeId: "fma", label: "Filme: Conqueror of Shamballa (Sequel 2003)" },
  9135: { relationType: "MOVIE", universeId: "fma", label: "Filme: The Sacred Star of Milos" },
  7902: { relationType: "SPIN_OFF", universeId: "fma", label: "Brotherhood 4-koma Gekijou" },
  6421: { relationType: "SPECIAL", universeId: "fma", label: "Brotherhood Specials (4 OVAs)" },

  // KIMETSU NO YAIBA COSMOS
  38000: { relationType: "MAIN_SERIES", universeId: "kimetsu", label: "Kimetsu no Yaiba: Temporada 1", saga: "Kamado Tanjirou Risshi-hen" },
  40456: { relationType: "CANON_MOVIE", universeId: "kimetsu", label: "Filme Canônico: Trem Infinito (Mugen Train)", saga: "Mugen Ressha-hen" },
  49926: { relationType: "MAIN_SERIES", universeId: "kimetsu", label: "Trem Infinito: Versão TV", saga: "Mugen Ressha-hen TV" },
  47778: { relationType: "SEQUEL", universeId: "kimetsu", label: "Distrito do Entretenimento", saga: "Yuukaku-hen" },
  51019: { relationType: "SEQUEL", universeId: "kimetsu", label: "Vila dos Ferreiros", saga: "Katanakaji no Sato-hen" },
  55701: { relationType: "SEQUEL", universeId: "kimetsu", label: "Treinamento dos Hashiras", saga: "Hashira Geiko-hen" },
  59192: { relationType: "CANON_MOVIE", universeId: "kimetsu", label: "Castelo Infinito - Filme 1: Akaza Sairai", saga: "Mugenjou-hen" },

  // JUJUTSU KAISEN COSMOS
  48561: { relationType: "PREQUEL", universeId: "jujutsu-kaisen", label: "Jujutsu Kaisen 0 (Filme Prólogo Canônico)", saga: "Prólogo de Yuta Okkotsu" },
  40748: { relationType: "MAIN_SERIES", universeId: "jujutsu-kaisen", label: "Jujutsu Kaisen: Temporada 1", saga: "Introdução & Feto Amaldiçoado" },
  51009: { relationType: "SEQUEL", universeId: "jujutsu-kaisen", label: "Jujutsu Kaisen: Temporada 2", saga: "Passado de Gojo & Incidente de Shibuya" },
  57658: { relationType: "SEQUEL", universeId: "jujutsu-kaisen", label: "Jogo do Abate (Shimetsu Kaiyuu) - Parte 1", saga: "Shimetsu Kaiyuu" },
  63824: { relationType: "SEQUEL", universeId: "jujutsu-kaisen", label: "Jogo do Abate (Shimetsu Kaiyuu) - Parte 2", saga: "Shimetsu Kaiyuu" },

  // ATTACK ON TITAN (SHINGEKI NO KYOJIN)
  16498: { relationType: "MAIN_SERIES", universeId: "shingeki", label: "Shingeki no Kyojin: Temporada 1", saga: "Queda de Shiganshina" },
  25777: { relationType: "SEQUEL", universeId: "shingeki", label: "Shingeki no Kyojin: Temporada 2", saga: "Confronto da Muralha Rose" },
  35760: { relationType: "SEQUEL", universeId: "shingeki", label: "Shingeki no Kyojin: Temporada 3 (Parte 1)", saga: "Golpe de Estado" },
  38524: { relationType: "SEQUEL", universeId: "shingeki", label: "Shingeki no Kyojin: Temporada 3 (Parte 2)", saga: "Retomada de Shiganshina" },
  40028: { relationType: "SEQUEL", universeId: "shingeki", label: "The Final Season (Parte 1)", saga: "Invasão de Marley" },
  48583: { relationType: "SEQUEL", universeId: "shingeki", label: "The Final Season (Parte 2)", saga: "O Rugido da Terra" },
  51535: { relationType: "SEQUEL", universeId: "shingeki", label: "The Final Season: Conclusão Final", saga: "Batalha do Céu e da Terra" },
  25781: { relationType: "PREQUEL", universeId: "shingeki", label: "Kuinaki Sentaku: Sem Arrependimentos (OVA Levi)" },
  36106: { relationType: "SPIN_OFF", universeId: "shingeki", label: "Lost Girls (Annie & Mikasa OVA)" },

  // HUNTER X HUNTER COSMOS
  11061: { relationType: "MAIN_SERIES", universeId: "hunter-x-hunter", label: "Hunter x Hunter 2011 (Madhouse)", saga: "Jornada Completa" },
  136: { relationType: "ALT_ADAPTATION", universeId: "hunter-x-hunter", label: "Hunter x Hunter 1999 (Nippon Animation)", saga: "Clássico 1999" },
  19951: { relationType: "MOVIE", universeId: "hunter-x-hunter", label: "Filme: The Last Mission" },
  14837: { relationType: "MOVIE", universeId: "hunter-x-hunter", label: "Filme: Phantom Rouge" },

  // ONE PIECE COSMOS
  21: { relationType: "MAIN_SERIES", universeId: "one-piece", label: "One Piece (Série Principal Contínua)", saga: "Grand Line ao Novo Mundo" },
  459: { relationType: "MOVIE", universeId: "one-piece", label: "One Piece: O Filme (2000)" },
  4155: { relationType: "CANON_MOVIE", universeId: "one-piece", label: "One Piece Filme 10: Strong World", saga: "East Blue Especial" },
  12859: { relationType: "CANON_MOVIE", universeId: "one-piece", label: "One Piece Filme 12: Z", saga: "Novo Mundo" },
  31490: { relationType: "CANON_MOVIE", universeId: "one-piece", label: "One Piece Filme 13: Gold", saga: "Gran Tesoro" },
  38234: { relationType: "CANON_MOVIE", universeId: "one-piece", label: "One Piece Filme 14: Stampede", saga: "Festival Pirata" },
  50410: { relationType: "CANON_MOVIE", universeId: "one-piece", label: "One Piece Filme 15: Red", saga: "Uta / Elegia" },

  // DRAGON BALL COSMOS
  223: { relationType: "MAIN_SERIES", universeId: "dragon-ball", label: "Dragon Ball Clássico (1986)", saga: "Goku Criança" },
  813: { relationType: "SEQUEL", universeId: "dragon-ball", label: "Dragon Ball Z (1989)", saga: "Sayajins até Majin Boo" },
  30694: { relationType: "SEQUEL", universeId: "dragon-ball", label: "Dragon Ball Super (2015)", saga: "Deuses & Torneio do Poder" },
  56894: { relationType: "SEQUEL", universeId: "dragon-ball", label: "Dragon Ball Daima (2024)", saga: "Reino dos Demônios" },
  225: { relationType: "ALT_ADAPTATION", universeId: "dragon-ball", label: "Dragon Ball GT (1996 - Anime Original)", saga: "Linha Alternativa GT" },
  36946: { relationType: "CANON_MOVIE", universeId: "dragon-ball", label: "Dragon Ball Super: Broly (Canônico)", saga: "Pós-Torneio do Poder" },
  48903: { relationType: "CANON_MOVIE", universeId: "dragon-ball", label: "Dragon Ball Super: Super Hero (Canônico)", saga: "Super Hero" },

  // DEATH NOTE COSMOS
  1535: { relationType: "MAIN_SERIES", universeId: "death-note", label: "Death Note (Série Canônica Completa)", saga: "Kira vs L" },
  2994: { relationType: "SPECIAL", universeId: "death-note", label: "Death Note: Relight - Visão de Ryuk" },
  3752: { relationType: "SPECIAL", universeId: "death-note", label: "Death Note: Relight 2 - Sucessores de L" },
};

/**
 * Classifica uma obra com base no registro explícito ou regras heurísticas determinísticas do MAL.
 */
export function classifyUniverseWorkWithMAL(work: {
  id?: number | string;
  mal_id?: number | string;
  title: string;
  format?: string;
  episodes_count?: number;
  year?: number;
  universe_id?: string;
}): UniverseWorkClassification {
  const malId = Number(work.mal_id || work.id);
  const known = KNOWN_CANONICAL_WORKS[malId];

  if (known) {
    const isCanon =
      known.relationType === "MAIN_SERIES" ||
      known.relationType === "SEQUEL" ||
      known.relationType === "PREQUEL" ||
      known.relationType === "CANON_MOVIE" ||
      known.relationType === "ALT_ADAPTATION";

    switch (known.relationType) {
      case "MAIN_SERIES":
        return {
          relationType: "MAIN_SERIES",
          label: known.label || "Série Canônica",
          isCanon: true,
          bg: "rgba(16, 185, 129, 0.15)",
          border: "rgba(16, 185, 129, 0.4)",
          text: "#34D399",
          saga: known.saga,
          universeId: known.universeId,
        };
      case "SEQUEL":
        return {
          relationType: "SEQUEL",
          label: known.label || "Continuação (Sequel)",
          isCanon: true,
          bg: "rgba(52, 211, 153, 0.15)",
          border: "rgba(52, 211, 153, 0.4)",
          text: "#34D399",
          saga: known.saga,
          universeId: known.universeId,
        };
      case "PREQUEL":
        return {
          relationType: "PREQUEL",
          label: known.label || "Prólogo Canônico (Prequel)",
          isCanon: true,
          bg: "rgba(14, 165, 233, 0.15)",
          border: "rgba(14, 165, 233, 0.4)",
          text: "#38BDF8",
          saga: known.saga,
          universeId: known.universeId,
        };
      case "CANON_MOVIE":
        return {
          relationType: "CANON_MOVIE",
          label: known.label || "Filme Canônico (1 Ep Longo)",
          isCanon: true,
          bg: "rgba(168, 85, 247, 0.15)",
          border: "rgba(168, 85, 247, 0.4)",
          text: "#C084FC",
          saga: known.saga,
          universeId: known.universeId,
        };
      case "ALT_ADAPTATION":
        return {
          relationType: "ALT_ADAPTATION",
          label: known.label || "Adaptação Alternativa",
          isCanon: true,
          bg: "rgba(59, 130, 246, 0.15)",
          border: "rgba(59, 130, 246, 0.4)",
          text: "#60A5FA",
          saga: known.saga,
          universeId: known.universeId,
        };
      case "SPIN_OFF":
        return {
          relationType: "SPIN_OFF",
          label: known.label || "Spin-off / Derivado",
          isCanon: false,
          bg: "rgba(245, 158, 11, 0.15)",
          border: "rgba(245, 158, 11, 0.4)",
          text: "#FBBF24",
          saga: known.saga,
          universeId: known.universeId,
        };
      case "MOVIE":
        return {
          relationType: "MOVIE",
          label: known.label || "Filme / Longa",
          isCanon: false,
          bg: "rgba(129, 140, 248, 0.15)",
          border: "rgba(129, 140, 248, 0.4)",
          text: "#A5B4FC",
          universeId: known.universeId,
        };
      case "SPECIAL":
      default:
        return {
          relationType: "SPECIAL",
          label: known.label || "Especial / OVA",
          isCanon: false,
          bg: "rgba(161, 161, 170, 0.15)",
          border: "rgba(161, 161, 170, 0.3)",
          text: "#D4D4D8",
          universeId: known.universeId,
        };
    }
  }

  // Regras Gerais Heurísticas para Obras Não Catalogadas Manualmente
  const title = (work.title || "").toLowerCase();
  const format = String(work.format || "TV").toUpperCase();

  const isMovie = format === "MOVIE" || /\bmovie\b/i.test(title);
  const isSpecial =
    format === "SPECIAL" ||
    format === "OVA" ||
    format === "ONA" ||
    /\b(special|omake|recap|pv)\b/i.test(title);
  const isSpinOff =
    /\b(rock lee|karaburi|4-koma|sd|collab|omake)\b/i.test(title) ||
    /burn the witch/i.test(title);

  const fallbackUniverseId =
    work.universe_id && !work.universe_id.startsWith("mal-")
      ? work.universe_id
      : `univ-${malId}`;

  if (isSpinOff) {
    return {
      relationType: "SPIN_OFF",
      label: "Spin-off / Derivado",
      isCanon: false,
      bg: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.4)",
      text: "#FBBF24",
      universeId: fallbackUniverseId,
    };
  }

  if (isMovie) {
    const isCanonMovie = /the last: naruto/i.test(title) || /mugen train/i.test(title) || /mugen ressha/i.test(title);
    return {
      relationType: isCanonMovie ? "CANON_MOVIE" : "MOVIE",
      label: isCanonMovie ? "Filme Canônico (1 Ep Longo)" : "Filme / Longa",
      isCanon: isCanonMovie,
      bg: isCanonMovie ? "rgba(168, 85, 247, 0.15)" : "rgba(129, 140, 248, 0.15)",
      border: isCanonMovie ? "rgba(168, 85, 247, 0.4)" : "rgba(129, 140, 248, 0.4)",
      text: isCanonMovie ? "#C084FC" : "#A5B4FC",
      universeId: fallbackUniverseId,
    };
  }

  if (isSpecial) {
    return {
      relationType: "SPECIAL",
      label: "Especial / OVA",
      isCanon: false,
      bg: "rgba(161, 161, 170, 0.15)",
      border: "rgba(161, 161, 170, 0.3)",
      text: "#D4D4D8",
      universeId: fallbackUniverseId,
    };
  }

  return {
    relationType: "MAIN_SERIES",
    label: "Série Canônica",
    isCanon: true,
    bg: "rgba(16, 185, 129, 0.15)",
    border: "rgba(16, 185, 129, 0.4)",
    text: "#34D399",
    universeId: fallbackUniverseId,
  };
}
