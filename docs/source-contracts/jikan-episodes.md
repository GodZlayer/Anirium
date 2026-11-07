# Jikan: complemento automatico de episodios

O ciclo Laravel executa este complemento depois do AniZip, inclusive para animes
com documento AniZip. Dados presentes sao compostos por campo com procedencia.
Obras em quarentena e publicacoes escritas ficam fora da fila. Uma resposta parcial
nao apaga numeros anteriores; somente numeros explicitamente recebidos entram na uniao.

## Contrato e identidade

Endpoint GET `https://api.jikan.moe/v4/anime/{MAL_ID}/episodes?page={pagina}`.
O ID pertence ao caminho da obra; `data[].mal_id` significa numero do episodio,
nao ID de outra obra. A coleta segue `pagination.has_next_page` ate false.
`current_page`, quando presente, precisa corresponder a pagina pedida.
Repeticoes entre paginas, numeros fora do total conhecido, paginas vazias com
continuacao e respostas sem sinal de continuacao sao rejeitadas.

Contrato oficial consultado em22/10/2026:
https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json
e https://docs.api.jikan.moe/#tag/anime/operation/getAnimeEpisodes.
O OpenAPI consultado esta em storage/app/catalog/probes/jikan-episodes/openapi.json.
Uma consulta real a SAO11757 resultou UND_ERR_CONNECT_TIMEOUT; isso nao valida
conteudo real retornado nem comprova indisponibilidade geral da fonte.

Campos usados: title, title_japanese, title_romanji, aired, filler e recap.
Somente episodios efetivamente listados entram no documento. Numeracao esparsa
permanece esparsa; terminar a paginacao nao significa cobrir o total informado.
Filler/recap sao indicadores originais por episodio; false nunca vira canon.
O campo aired fornece data publicada, sem garantia de horario de transmissao:
air_date_utc permanece null. URLs de video, forum, notas e sinopses nao sao
importadas por este conector. O cache usa source=jikan e upstream=myanimelist.
As restricoes dos dados MAL permanecem aplicaveis; a licenca do software Jikan
nao e apresentada como licenca dos dados.

## Orcamento, cache e retomada

No maximo20 requisicoes HTTP por ciclo, limitado tambem pelo orcamento de episodios
existente;180s totais de rede,1100ms entre requisicoes e timeout individual25s.
Compartilha seasons/source-cooldown.json com descoberta Jikan; respeita Retry-After.
O diretorio de fontes segue a isolacao do bootstrap, sem importar caches publicos.

Checkpoint atomico por obra/generation, paginas em caminhos fixos, validade parcial
24h. Total alterado invalida a geracao parcial. Cada pagina conserva observedAt;
o documento usa a data inicial conservadora e cada episodio conserva sua observacao.
Um cache final so e gravado depois de terminar e validar a paginacao. Atualizacao
concluida marca o checkpoint, e o TTL final e30dias para obras concluidas ou6h nas
demais. Documentos existentes continuam publicados durante falhas ou reducao dos
numeros recebidos; o relatorio conta episodios preservados. Cache e documento publicado sao
estados distintos, e a auditoria verifica hash, identidade e numeros do documento.
Orcamento esgotado interrompe a obra com checkpoint, sem registrar indisponibilidade
da fonte nem criar cooldown artificial para obras ainda nao consultadas.

## Evidencia e limites

Testes reproduziveis: node --test scripts/catalog/jikan-episode-reader.test.mjs
scripts/catalog/jikan-episode-batch.test.mjs scripts/catalog/episode-metadata-loader.test.mjs.
Cobrem retomada de pagina, orcamento HTTP, cooldown429, corrupcao de checkpoint,
numeracao ambigua, preservacao de documentos, identidade anime/manga e carregamento
pelo mesmo leitor usado no site. A aceitacao remota real ainda esta pendente.

## Composicao por campo

O publicador pode gerar documento derivado schema2/source=anirium, sem apresentar
Anirium como outra fonte remota. Cada campo presente aponta para evidencia de
origem com provider, URL por obra, observacao e upstream quando Jikan. A raiz
preserva work_titles, external_ids, specials e rejected_numbers com procedencia.
Cada episodio preserva numeros, titulos por idioma, datas, IDs, duracao e indicadores
originais, sem transformar filler=false em canon ou datas em horarios precisos.

Campos nao vazios AniZip tem prioridade entre provedores; Jikan completa lacunas.
No mesmo provedor prevalece observacao mais nova, sem apagar campos ausentes na
resposta nova. Contradicoes de uma mesma observacao sao rejeitadas. Divergencias
entre provedores conservam os dois valores e suas evidencias no documento. Apenas
o ultimo candidato de cada provedor/campo e mantido; evidencias sem uso sao podadas.
checked_at e a menor data dos campos selecionados, nunca a data da composicao.
Uniao somente por numeros locais explicitos da mesma obra, sem offset ou inferencia
por contagem. Hash e ordenacao sao deterministas; caches de origem continuam separados.

O leitor compartilhado com o site rejeita campos derivados sem evidencia e origens
incompativeis. O relatorio conta composedWorks, episodeConflicts e preservedEpisodes.
Testes adicionais: scripts/catalog/episode-composition.test.mjs e
scripts/catalog/supplemental-stage.test.mjs. Probe de compatibilidade local:
`node scripts/probe-episode-composition.mjs`, sem modificar a publicacao. Em22/10/2026
conferiu2773arquivos/654812campos e106pares historicos, sem falhas. Isso nao substitui
a aceitacao remota real de Jikan.

Probe real isolado: `node scripts/probe-jikan-episodes.mjs --mal=11757 --episodes=25`.
Salva relatorio/cache e documentos em storage/app/catalog/probes/jikan-episodes/11757;
nao modifica o manifesto publico. Um resultado de timeout e evidencia de falha
observada, nao de conteudo aceito.
