// Known Portuguese titles / common names dictionary for high-accuracy mapping
export const PORTUGUESE_TITLE_MAP: Record<string, string> = {
  "Shingeki no Kyojin": "Ataque dos Titãs",
  "Attack on Titan": "Ataque dos Titãs",
  "Kimetsu no Yaiba": "Demon Slayer: Caçador de Demônios",
  "Demon Slayer: Kimetsu no Yaiba": "Demon Slayer: Caçador de Demônios",
  "Boku no Hero Academia": "My Hero Academia",
  "My Hero Academia": "My Hero Academia",
  "One Punch Man": "One-Punch Man: Homem de Um Soco Só",
  "Nanatsu no Taizai": "Os Sete Pecados Capitais",
  "The Seven Deadly Sins": "Os Sete Pecados Capitais",
  "Tensei shitara Slime Datta Ken": "Aquela Vez que Reencarnei como um Slime",
  "That Time I Got Reincarnated as a Slime": "Aquela Vez que Reencarnei como um Slime",
  "Kanojo, Okarishimasu": "Alugue uma Namorada",
  "Rent-a-Girlfriend": "Alugue uma Namorada",
  "Tate no Yuusha no Nariagari": "A Ascensão do Herói do Escudo",
  "The Rising of the Shield Hero": "A Ascensão do Herói do Escudo",
  "Enen no Shouboutai": "Fire Force",
  "Fire Force": "Fire Force",
  "Yakusoku no Neverland": "O Prometido Neverland",
  "The Promised Neverland": "O Prometido Neverland",
  "Kiseijuu: Sei no Kakuritsu": "Parasyte",
  "Parasyte -the maxim-": "Parasyte",
  "Kaguya-sama wa Kokurasetai: Tensai-tachi no Renai Zunousen": "Kaguya-sama: Love Is War",
  "Kaguya-sama: Love is War": "Kaguya-sama: Love Is War",
  "Sousou no Frieren": "Frieren e a Jornada para o Além",
  "Frieren: Beyond Journey's End": "Frieren e a Jornada para o Além",
  "Kusuriya no Hitorigoto": "Diários de uma Apotecária",
  "The Apothecary Diaries": "Diários de uma Apotecária",
  "Jujutsu Kaisen": "Jujutsu Kaisen: Batalha de Feiticeiros",
  "Death Note": "Death Note: Caderno da Morte",
  "Hunter x Hunter": "Hunter x Hunter: Caçador vs Caçador",
  "Fullmetal Alchemist: Brotherhood": "Fullmetal Alchemist: O Alquimista de Aço",
  "Haikyuu!!": "Haikyu!! Os Ases do Vôlei",
  "Chainsaw Man": "Homem Motosserra",
  "Black Clover": "Trevo Negro",
  "Tokyo Revengers": "Vingadores de Tóquio",
  "Mushoku Tensei: Isekai Ittara Honki Dasu": "Mushoku Tensei: Reencarnação no Outro Mundo",
  "Dr. STONE": "Dr. Stone",
  "Vinland Saga": "Saga de Vinland",
  "Solo Leveling": "Solo Leveling: Subindo de Nível Sozinho",
  "Ore dake Level Up na Ken": "Solo Leveling: Subindo de Nível Sozinho",
  "Kaiju No. 8": "Kaiju Número 8",
  "SPY x FAMILY": "Spy x Family: Família de Espiões",
  "Bleach": "Bleach",
  "Naruto": "Naruto",
  "Naruto: Shippuuden": "Naruto Shippuden",
  "One Piece": "One Piece",
  "Dragon Ball Z": "Dragon Ball Z",
  "JoJo no Kimyou na Bouken": "As Aventuras Bizarras de JoJo",
  "JoJo's Bizarre Adventure": "As Aventuras Bizarras de JoJo",
};

// Build reverse mapping (Portuguese title -> Romaji / English names)
const REVERSE_PORTUGUESE_MAP: Array<{ ptPattern: RegExp; queryTerms: string[] }> = [];

for (const [original, pt] of Object.entries(PORTUGUESE_TITLE_MAP)) {
  const cleanPt = pt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const leadingWords = cleanPt.split(/\s+/).slice(0, 3).join("\\s+");
  if (leadingWords.length >= 4) {
    REVERSE_PORTUGUESE_MAP.push({
      ptPattern: new RegExp(`\\b${leadingWords}\\b`, "i"),
      queryTerms: [original],
    });
  }
}

// Common Portuguese terms mapped to typical anime title words
const COMMON_PT_MAPPINGS: Record<string, string[]> = {
  "ataque": ["Shingeki", "Attack"],
  "titas": ["Kyojin", "Titan"],
  "titans": ["Kyojin", "Titan"],
  "feiticeiros": ["Jujutsu Kaisen"],
  "feiticeiro": ["Jujutsu Kaisen", "Mahoutsukai"],
  "cacador": ["Hunter", "Kimetsu"],
  "cacadores": ["Hunter", "Kimetsu"],
  "demonio": ["Kimetsu", "Akuma", "Demon"],
  "demonios": ["Kimetsu", "Akuma", "Demon"],
  "motosserra": ["Chainsaw Man"],
  "reencarnacao": ["Tensei", "Reincarnated", "Mushoku"],
  "reencarnei": ["Tensei", "Reincarnated"],
  "reencarnado": ["Tensei", "Reincarnated"],
  "expulso": ["Tsuihou", "Banished"],
  "exilado": ["Tsuihou", "Exiled"],
  "slime": ["Slime", "Tensei shitara Slime"],
  "escudo": ["Tate no Yuusha", "Shield Hero"],
  "alquimista": ["Fullmetal Alchemist", "Hagane no Renkinjutsushi"],
  "espioes": ["Spy x Family"],
  "espiao": ["Spy x Family"],
  "cavaleiro": ["Juukishi", "Knight", "Kishi"],
  "subindo de nivel": ["Solo Leveling", "Ore dake Level Up"],
  "vingadores": ["Tokyo Revengers"],
  "apotecaria": ["Kusuriya no Hitorigoto", "Apothecary Diaries"],
  "viagem": ["Frieren", "Sousou no Frieren"],
  "jornada": ["Frieren", "Sousou no Frieren"],
};

export function resolvePortugueseTitle(romaji?: string, english?: string): string {
  if (romaji && PORTUGUESE_TITLE_MAP[romaji]) return PORTUGUESE_TITLE_MAP[romaji];
  if (english && PORTUGUESE_TITLE_MAP[english]) return PORTUGUESE_TITLE_MAP[english];
  return english || romaji || "";
}

/**
 * Returns candidate original search terms when the user types in Portuguese.
 * Example: "ataque" -> ["Shingeki", "Attack"], "expulso" -> ["Tsuihou"], "reencarnado" -> ["Tensei"]
 */
export function getPortugueseSearchCandidates(input: string): string[] {
  const normalized = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const candidates = new Set<string>();

  // 1. Direct dictionary matches
  for (const entry of REVERSE_PORTUGUESE_MAP) {
    if (entry.ptPattern.test(normalized)) {
      entry.queryTerms.forEach((t) => candidates.add(t));
    }
  }

  // 2. Word by word mapping for common anime concepts in Portuguese
  const words = normalized.split(/\s+/);
  for (const w of words) {
    if (COMMON_PT_MAPPINGS[w]) {
      COMMON_PT_MAPPINGS[w].forEach((t) => candidates.add(t));
    }
  }

  return Array.from(candidates);
}
