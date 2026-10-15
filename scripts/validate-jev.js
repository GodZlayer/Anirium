// Script de validação semântica com TypeSafe Jev System One
// Compara a classificação de animes do nosso catálogo com o padrão real de MyAnimeList

const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;

if (!TYPESAFE_API_KEY) {
  console.error("ERRO: TYPESAFE_API_KEY não encontrada no ambiente.");
  process.exit(1);
}

async function callJev(state, questions) {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TYPESAFE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state,
      model: "jev-latest",
      questions,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`TypeSafe API erro (${res.status}): ${txt}`);
  }

  return await res.json();
}

async function runValidation() {
  console.log("=== INICIANDO VALIDAÇÃO CANÔNICA COM JEV SYSTEM ONE (TYPESAFE) ===\n");

  // Amostras de animes representativos do catálogo
  const samples = [
    {
      title: "Mushoku Tensei: Jobless Reincarnation",
      genres: ["Adventure", "Drama", "Fantasy"],
      tags: ["Isekai", "Magic", "Reincarnation"],
      status: "FINISHED",
      format: "TV",
      episodes: 23,
    },
    {
      title: "STEEL BALL RUN JoJo's Bizarre Adventure",
      genres: ["Action", "Adventure", "Supernatural"],
      tags: ["Seinen", "Historical", "Super Power"],
      status: "NOT_YET_RELEASED",
      format: "OVA",
      episodes: 0,
    },
    {
      title: "Ascendance of a Bookworm",
      genres: ["Fantasy", "Slice of Life"],
      tags: ["Isekai", "Female Protagonist", "Reincarnation"],
      status: "RELEASING",
      format: "TV",
      episodes: 24,
    },
    {
      title: "Demon Slayer: Kimetsu no Yaiba - Mugen Train",
      genres: ["Action", "Fantasy"],
      tags: ["Shounen", "Historical", "Demons", "Swordplay"],
      status: "FINISHED",
      format: "MOVIE",
      episodes: 1,
    }
  ];

  for (const sample of samples) {
    console.log(`\n▶ Validando Obra: "${sample.title}"`);
    console.log(`  Gêneros atribuídos: ${sample.genres.join(", ")}`);
    console.log(`  Subgêneros/Temas (tags): ${sample.tags.join(", ")}`);
    console.log(`  Formato: ${sample.format} | Status: ${sample.status} | Eps: ${sample.episodes}`);

    const state = {
      anime_title: sample.title,
      genres: sample.genres,
      themes_tags: sample.tags,
      format: sample.format,
      status: sample.status,
      episodes: sample.episodes,
      myanimelist_standard: "MyAnimeList divides anime into Main Genres (Action, Adventure, Comedy, Drama, Fantasy, Sci-Fi, etc.), Explicit Themes/Demographics (Isekai, Shounen, Seinen, Mecha, Psychological, School, Military), and Formats (TV, Movie, OVA, ONA, Special)."
    };

    const questions = {
      is_mal_genre_taxonomy_valid: {
        type: "noul",
        instructions: "De acordo com o padrão do MyAnimeList, os gêneros e temas atribuídos a esta obra refletem com fidelidade o mundo real?",
        criteria: {
          true: "Os gêneros e subgêneros/temas mapeados batem com os registros oficiais do MAL",
          false: "Existe discrepância séria ou classificação incorreta"
        }
      },
      is_airing_season_status_accurate: {
        type: "choice",
        instructions: "Conforme o conceito canônico: 'Temporada' = animes com exibição ativa (entre ep 1 e o último), 'Todos' = animes com pelo menos 1 ep já estreado, 'Estreia/Upcoming' = ainda não lançou. Em qual sumário este anime pertence com precisão?",
        criteria: {
          temporada: "Anime atualmente em exibição (status RELEASING/AIRING com eps saindo)",
          todos_catalogo: "Anime com episódios já lançados (FINISHED ou catálogo histórico com >= 1 ep)",
          estreia_futura: "Anime não lançado (episodes == 0 ou NOT_YET_RELEASED)"
        }
      },
      format_consistency: {
        type: "noul",
        instructions: `O formato '${sample.format}' está correto para a obra '${sample.title}' segundo a taxonomia MAL/AniList?`,
        criteria: {
          true: "Formato consistente com a indústria de anime (TV, Movie, OVA, ONA, Special)",
          false: "Formato atribuído é inválido"
        }
      }
    };

    try {
      const response = await callJev(state, questions);
      const answers = response.answers;

      const genreScore = (answers.is_mal_genre_taxonomy_valid?.noul * 100).toFixed(1);
      const formatScore = (answers.format_consistency?.noul * 100).toFixed(1);
      const chosenSummary = answers.is_airing_season_status_accurate?.choice;
      const summaryConfidence = ((answers.is_airing_season_status_accurate?.confidence || 0) * 100).toFixed(1);

      console.log(`  ✓ Fidelidade Taxonômica MAL: ${genreScore}% de certeza`);
      console.log(`  ✓ Consistência de Formato: ${formatScore}%`);
      console.log(`  ✓ Julgamento do Sumário: "${chosenSummary}" (Confiança: ${summaryConfidence}%)`);
    } catch (e) {
      console.error(`  ✗ Falha ao validar com Jev:`, e.message);
    }
  }

  console.log("\n=== VALIDAÇÃO DE TAXONOMIA CONCLUÍDA ===");
}

runValidation();
