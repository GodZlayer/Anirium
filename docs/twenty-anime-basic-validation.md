# Teste de 20 animes: lançamento e imagem

Geração observada: 5a400194-2bf5-42f1-a5da-14d3561d3aa2.

Mesma amostra reavaliada na geração 803b9205-634c-4e0e-a434-cd0c769c5531; as lacunas de grade e os episódios futuros destacados abaixo permanecem.

A checagem de catálogo usa as partições publicadas, documentos de episódios com checksum e as funções reais de seleção do frontend. A reprodução em lote usa o executável nativo aberto, autorização normal da conta de teste e decodificação FFmpeg de uma imagem do HLS entregue. Isso comprova imagem decodificável pelo Service; não equivale a assistir cada episódio inteiro no navegador.

Cada tentativa tem orçamento de 240 segundos após a emissão da sessão, mais até 30 segundos para decodificação do quadro pronto. Um limite de tempo registra imagem não confirmada nessa rodada; não prova indisponibilidade permanente. Fontes e peers são externos e variam.

A repetição preserva os resultados da primeira rodada e permite até 300 segundos para a janela, após a descoberta, com renovação normal da credencial. Em One Piece foram amostrados também 10 e 20 segundos para esclarecer a vinheta inicial.

| Anime | Grupo | Grade | Último com data passada | Próximo futuro | Imagem |
|---|---|---:|---:|---:|---|
| Cowboy Bebop | antigo | 26 | 26 | — | Sim: ep. 26, 239s |
| Shinseiki Evangelion | antigo | 26 | 26 | — | Sim: ep. 26, 181s |
| Death Note | antigo | 37 | 37 | — | Sim: ep. 37, 229s |
| Naruto | antigo | 220 | — | — | Sim: ep. 220, 150s |
| Hunter x Hunter (2011) | antigo | 148 | — | — | Sim: ep. 148, 185s |
| Sousou no Frieren | recente-completo | 0 | — | — | Sim: ep. 1, 187s |
| Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen | recente-completo | 12 | — | — | Sim: ep. 12, 235s |
| Ore dake Level Up na Ken Season 2: Arise from the Shadow | recente-completo | 0 | — | — | Sim: ep. 1, 225s |
| Kimetsu no Yaiba: Hashira Geiko-hen | recente-completo | 8 | — | — | Sim no reteste: ep. 8, 260s (1ª: failed-or-timeout) |
| Chainsaw Man Movie: Reze-hen | recente-completo | 0 | — | — | Sim no reteste: ep. 1, 163s (1ª: failed-or-timeout) |
| Boku no Hero Academia 7th Season | recente-completo | 21 | — | — | Sim no reteste: ep. 21, 258s (1ª: failed-or-timeout) |
| One Piece | em-lançamento | 1184 | 1180 | — | Sim: ep. 1180, 171s |
| Hotaru no Yomeiri | em-lançamento | 8 | 3 | 4 | Sim no reteste: ep. 3, 155s (1ª: http-503) |
| Tokyo Revengers: Santen Sensou-hen | em-lançamento | 8 | 4 | 5 | Sim: ep. 4, 204s |
| Uchi no Otouto-domo ga Sumimasen | em-lançamento | 20 | 16 | 17 | Sim: ep. 16, 184s |
| Kusuriya no Hitorigoto 3rd Season | em-lançamento | 8 | 4 | 5 | Sim: ep. 4, 195s |
| Bleach: Sennen Kessen-hen - Kashin-tan | em-lançamento | 10 | 9 | 10 | Sim: ep. 9, 208s |
| Naruto x Ninkuu | futuro | 4 | — | — | Futuro: não reproduzido |
| Isekai Munchkin: HP1 no Mama de Saikyou Saisoku Dungeon Kouryaku | futuro | 0 | — | — | Futuro: não reproduzido |
| Creature Hunters | futuro | 0 | — | — | Futuro: não reproduzido |

## Achados de navegação

- One Piece 1180: a suspeita inicial causada pela imagem aos 2 s foi esclarecida. Aos 10 s aparece a marca Toei Animation; aos 20 s aparece o anime esperado. Duração de 1.415,72 s. A vinheta do estúdio não é evidência de fonte trocada.
- O botão Assistir do lobby abre a obra, sem selecionar diretamente o último episódio confirmado.
- O calendário informa horário previsto, sem declarar transmissão concluída; não oferece indicação direta do número do último episódio confirmado.
- Naruto: grade com 220 episódios; o episódio 220 abriu corretamente e Próximo ficou desativado. Falta um atalho ao fim da grade extensa.
- Universo Naruto: 23 lançamentos conectados carregados, incluindo Boruto e derivados. Boruto Part 2 tem status NOT_YET_RELEASED no catálogo, mas seu card mostrou somente formato e ano desconhecido, sem destacar Em Breve.
- Bleach: a consulta do episódio 9 da obra atual retornou tanto releases Kashin-tan 09 quanto a numeração acumulada S01E49/S17E49. Essa diferença de numeração é esperada no mapeamento e não indica, isoladamente, episódio errado.
- Hotaru no Yomeiri: último com data passada é 3, mas a grade oferece 1–8 sem distinguir ali os futuros 4–8. A tela do episódio 4 mostra 30/10/2026, mas permite entrar no contexto e marcar concluído.
- Tokyo Revengers: Santen Sensou-hen: último com data passada é 4; a grade também oferece 5–8.
- Uchi no Otouto-domo ga Sumimasen: último com data passada é 16; a grade inclui 17–20.
- Frieren, Solo Leveling 2 e Chainsaw Man: Reze têm total informado, mas não têm grade navegável nesta geração. Não confundir total conhecido com episódios indexados.
- Obras sem datas suficientes não receberam último lançamento inventado. Para completas com grade, o teste de imagem usa o último número indexado; sem grade usa episódio 1 e isso não corrige a navegação.
- Três obras futuras pertencem à amostra de navegação, não ao denominador de reprodução. Ausência de fonte, indisponibilidade, tempo esgotado e imagem decodificada são resultados diferentes.

## Evidências

- `storage/app/catalog/probes/twenty-anime/catalog.json`
- `storage/app/catalog/probes/twenty-anime/playback.json`
- `storage/app/catalog/probes/twenty-anime/frieren-empty-grid.png`
- `storage/app/catalog/probes/twenty-anime/hotaru-future-episodes.png`
