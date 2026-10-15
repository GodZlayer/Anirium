import { Anime } from "@/types/anime";

export interface FranchiseGroup {
  id: string; // root key, ex: "naruto", "one-piece", "bleach"
  rootTitle: string; // Título canônico principal da franquia
  title_portuguese?: string;
  title_english?: string;
  representativeAnime: Anime; // Anime representativo principal completo
  worksCount: number; // Quantidade de obras/temporadas agregadas
  seasonsCount: number; // Número de temporadas contabilizadas
  averageScore: number; // Média ponderada ou média das notas válidas da franquia
  maxScore: number; // Maior nota individual dentro da franquia
  scoreCount: number; // Quantidade de obras com nota
  genres: Array<{ mal_id: number; name: string }>;
  tags: Array<{ id: number; name: string; category?: string }>;
  formats: string[]; // Formatos presentes na franquia (TV, MOVIE, OVA, etc.)
  yearsRange: string; // Ex: "1999 • 15+ obras" ou "2002 - 2017"
  memberAnimes: Anime[]; // Todas as obras membros da franquia
}

export function extractFranchiseRoot(title: string): string {
  if (!title) return "";
  const t = title.trim();

  // Mapeamentos Canônicos Mestres conhecidos para impedir fragmentação por subtítulos/sagas
  if (/^digimon/i.test(t)) return "Digimon";
  if (/^bleach/i.test(t)) return "Bleach";
  if (/^fate([\/:\s-]|$)/i.test(t) && !/^bayonetta/i.test(t)) return "Fate";
  if (/^(super\s+)?dragon\s*ball/i.test(t)) return "Dragon Ball";
  if (/^(naruto|boruto)/i.test(t)) return "Naruto";
  if (/^gintama/i.test(t)) return "Gintama";
  if (/^hunter\s*[x×]\s*hunter/i.test(t)) return "Hunter x Hunter";
  if (/^jojo('s)?\s+bizarre/i.test(t)) return "JoJo's Bizarre Adventure";
  if (/^(mobile\s+suit\s+)?gundam/i.test(t)) return "Mobile Suit Gundam";
  if (/^(sword\s*art\s*online|sao\b)/i.test(t)) return "Sword Art Online";
  if (/^(shingeki\s*no\s*kyojin|attack\s*on\s*titan)/i.test(t)) return "Attack on Titan";
  if (/^(boku\s*no\s*hero\s*academia|my\s*hero\s*academia)/i.test(t)) return "My Hero Academia";
  if (/^(one\s*piece)/i.test(t)) return "One Piece";
  if (/^(detective\s*conan|meitantei\s*conan)/i.test(t)) return "Detective Conan";
  if (/^(pokemon|pocket\s*monsters)/i.test(t)) return "Pokémon";
  if (/^(fullmetal\s*alchemist)/i.test(t)) return "Fullmetal Alchemist";

  let clean = t
    .replace(/\s*the\s*Movie\s*:\s*.+$/gi, "")
    .replace(/\s*Movie\s*:\s*.+$/gi, "")
    .replace(/\s*the\s*Movie\b/gi, "")
    .replace(/\s*\(Movie\)/gi, "")
    .replace(/\s*Movie\s*\d*/gi, "")
    .replace(/\s*Gekijouban\b/gi, "")
    .replace(/\s*Season\s*\d+/gi, "")
    .replace(/\s*\d+(?:nd|rd|th|st)\s*Season/gi, "")
    .replace(/\s*Final\s*Season/gi, "")
    .replace(/\s*The\s*Final\b/gi, "")
    .replace(/\s*Part\s*\d+/gi, "")
    .replace(/\s*\[.+?\].*$/g, "")
    .replace(/\s*:\s*.+$/, "") // Remove subtítulo
    .replace(/\s*-\s*.+$/, "") // Remove hífens de subtítulo
    .replace(/\s+(I{1,3}|IV|V|VI|VII|VIII|IX|X)\b/gi, "") // Numerais romanos
    .replace(/\s*\d+$/i, "") // Numerais finais
    .trim();

  return clean.length >= 2 ? clean : t;
}

/**
 * Converte um acervo de obras em Franquias Canônicas unificadas (sem fragmentação).
 * Cada franquia unifica suas notas e metadados diretamente a partir dos dados do Anirium.
 */
export function buildFranchisesFromCatalog(animes: Anime[]): FranchiseGroup[] {
  const franchiseMap = new Map<string, {
    key: string;
    rootTitle: string;
    members: Anime[];
  }>();

  for (const anime of animes) {
    // Determina a chave canônica da franquia
    const rootName = anime.franchise_root || extractFranchiseRoot(anime.title_english || anime.title);
    const key = rootName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || String(anime.mal_id);

    // Também verifica se já existe uma franquia com relação direta de seasons
    let targetKey = key;
    for (const [existingKey, group] of franchiseMap.entries()) {
      const isRelated = group.members.some((m) => {
        if (m.mal_id === anime.mal_id) return true;
        if (m.universe_id && anime.universe_id && m.universe_id === anime.universe_id) return true;
        const rootA = extractFranchiseRoot(m.title_english || m.title).toLowerCase();
        const rootB = extractFranchiseRoot(anime.title_english || anime.title).toLowerCase();
        if (rootA === rootB) return true;
        if (rootA.length >= 4 && rootB.startsWith(rootA)) return true;
        if (rootB.length >= 4 && rootA.startsWith(rootB)) return true;
        // Verifica se anime.seasons contém m.mal_id ou vice-versa
        if ((m.seasons || []).some((s) => s.id === anime.mal_id)) return true;
        if ((anime.seasons || []).some((s) => s.id === m.mal_id)) return true;
        return false;
      });

      if (isRelated) {
        targetKey = existingKey;
        break;
      }
    }

    if (!franchiseMap.has(targetKey)) {
      franchiseMap.set(targetKey, {
        key: targetKey,
        rootTitle: rootName,
        members: [],
      });
    }

    const group = franchiseMap.get(targetKey)!;
    if (!group.members.some((m) => m.mal_id === anime.mal_id)) {
      group.members.push(anime);
    }
  }

  const franchises: FranchiseGroup[] = [];

  for (const [key, group] of franchiseMap.entries()) {
    const members = group.members;
    if (members.length === 0) continue;

    // Identifica todos os IDs de seasons/obras conhecidas nesta franquia
    const allKnownSeasons = new Map<number, any>();
    const genresMap = new Map<string, { mal_id: number; name: string }>();
    const tagsMap = new Map<string, { id: number; name: string; category?: string }>();
    const formatsSet = new Set<string>();

    let totalScore = 0;
    let scoreCount = 0;
    let maxScore = 0;
    let minYear = 9999;
    let maxYear = 0;

    // Escolha do representante canônico (prioriza a obra com maior número de temporadas, mais antiga ou com maior nota)
    let bestRepresentative = members[0];
    let maxKnownSeasonsCount = 0;

    for (const member of members) {
      if (member.year && member.year > 1900) {
        if (member.year < minYear) minYear = member.year;
        if (member.year > maxYear) maxYear = member.year;
      }

      if (member.format) {
        formatsSet.add(member.format.toUpperCase());
      }

      if (member.score && member.score > 0) {
        totalScore += member.score;
        scoreCount += 1;
        if (member.score > maxScore) maxScore = member.score;
      }

      (member.genres || []).forEach((g) => {
        if (g && g.name) genresMap.set(g.name.toLowerCase(), g);
      });

      (member.tags || []).forEach((t) => {
        if (t && t.name) tagsMap.set(t.name.toLowerCase(), t);
      });

      // Seasons contidas no membro
      const memberSeasons = member.seasons || [];
      if (memberSeasons.length > maxKnownSeasonsCount) {
        maxKnownSeasonsCount = memberSeasons.length;
        bestRepresentative = member;
      }

      memberSeasons.forEach((s) => {
        allKnownSeasons.set(s.id, s);
        if (s.format) formatsSet.add(s.format.toUpperCase());
        if (s.year && s.year > 1900) {
          if (s.year < minYear) minYear = s.year;
          if (s.year > maxYear) maxYear = s.year;
        }
      });
      allKnownSeasons.set(member.mal_id, member);
    }

    // Nota Geral da Franquia: média aritmética das obras avaliadas da franquia
    const averageScore = scoreCount > 0
      ? Number((totalScore / scoreCount).toFixed(2))
      : (bestRepresentative.score || 0);

    const effectiveScore = averageScore > 0 ? averageScore : (bestRepresentative.score || 0);

    // Monta texto dos anos e obras
    const worksCount = Math.max(members.length, allKnownSeasons.size);
    let yearsRange = "";
    if (minYear !== 9999) {
      if (maxYear > minYear) {
        yearsRange = `${minYear} - ${maxYear} • ${worksCount} ${worksCount === 1 ? "obra" : "obras"}`;
      } else {
        yearsRange = `${minYear} • ${worksCount} ${worksCount === 1 ? "obra" : "obras"}`;
      }
    } else {
      yearsRange = `${worksCount} ${worksCount === 1 ? "obra" : "obras"}`;
    }

    // Garante que o representativeAnime tenha todas as seasons consolidadas
    const consolidatedSeasons = Array.from(allKnownSeasons.values()).map((s, idx) => ({
      id: s.id || s.mal_id,
      idMal: s.idMal,
      seasonNumber: idx + 1,
      title: s.title || bestRepresentative.title,
      title_english: s.title_english,
      format: s.format || "TV",
      episodes: s.episodes ?? null,
      status: s.status || "UNKNOWN",
      year: s.year,
      cover: s.cover || (s.images?.webp?.large_image_url || bestRepresentative.images?.webp?.large_image_url || bestRepresentative.images?.jpg?.large_image_url),
      streaming_links: s.streaming_links || bestRepresentative.streaming_links,
    }));

    consolidatedSeasons.sort((a, b) => {
      if ((a.year || 0) !== (b.year || 0)) {
        return (a.year || 9999) - (b.year || 9999);
      }
      return a.id - b.id;
    });

    consolidatedSeasons.forEach((s, idx) => {
      s.seasonNumber = idx + 1;
    });

    const representativeAnime: Anime = {
      ...bestRepresentative,
      score: effectiveScore,
      seasons: consolidatedSeasons,
      genres: Array.from(genresMap.values()),
      tags: Array.from(tagsMap.values()),
    };

    franchises.push({
      id: key,
      rootTitle: group.rootTitle || representativeAnime.title,
      title_portuguese: representativeAnime.title_portuguese,
      title_english: representativeAnime.title_english,
      representativeAnime,
      worksCount,
      seasonsCount: consolidatedSeasons.length,
      averageScore: effectiveScore,
      maxScore,
      scoreCount,
      genres: Array.from(genresMap.values()),
      tags: Array.from(tagsMap.values()),
      formats: Array.from(formatsSet),
      yearsRange,
      memberAnimes: members,
    });
  }

  return franchises;
}
