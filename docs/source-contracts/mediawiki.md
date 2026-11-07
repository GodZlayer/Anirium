# Wikipedia e Wikidata: arcos com evidencia explicita

Estado: coleta automatica habilitada no ciclo Laravel. O adapter usa fila com
retomada, cache persistente, cooldown e orcamento por ciclo. A admissao cobre
somente o formato restrito documentado abaixo; nao implica cobertura de todas as obras.

## Identidade e acesso

O leitor consulta a propriedade Wikidata P4086 (MyAnimeList anime ID) por igualdade
de identificador, nunca por semelhanca de titulo. Exige uma entidade, exatamente
um valor nao depreciado de P4086 e o sitelink enwiki correspondente. Um item com
varios IDs de temporadas ou uma consulta com varias entidades e rejeitado.

Fontes oficiais:

- https://www.wikidata.org/wiki/Property:P4086
- https://www.wikidata.org/wiki/Wikidata:Licensing
- https://en.wikipedia.org/wiki/Sword_Art_Online_II

Endpoints GET: query.wikidata.org/sparql, www.wikidata.org/wiki/Special:EntityData,
en.wikipedia.org/w/api.php?action=parse. O leitor recebe cliente injetado; o probe
usa User-Agent identificavel, intervalo global de1500ms, timeout25s, origens fixas,
sem redirecionamento automatico e resposta ate2MB. maxlag=5 protege o endpoint
MediaWiki. Nao usa contas, dados pessoais, cookies ou busca por titulo.

## Formato admitido

Somente o schema observado de Episode table com overallT=Story e seriesT=Episode:
Episode table/part declara Story arc ou Side Story com nome, e EpisodeNumber2
fornece numeros locais explicitos. Templates sao lidos com delimitacao balanceada;
comentarios/nowiki nao fornecem dados. A tabela deve cobrir exatamente1..N da obra,
sem repeticao, lacuna, decimal ou outra tabela candidata ambigua. Outros formatos
ficam sem evidencia suportada, nunca recebem divisao por contagem ou offset.

Isso e um adapter restrito, nao um parser universal da Wikipedia nem das wikis de
franquias. A lista completa de episodios serve apenas de verificacao da fronteira
de uma tabela publicada; nao gera o nome ou a divisao de nenhum arco.

## Dados e atribuicao

Somente nomes e intervalos; sem copiar sinopses ou converter arc/side-story em
canon/filler. classification permanece unknown. O registro conserva permalink
oldid, revisao, identidade Wikidata e sua revisao, rotulo original, data da coleta,
Wikipedia contributors, CC-BY-SA-4.0 e indicacao de transformacao. A identidade
estruturada Wikidata declara CC0-1.0. A pagina consultada explicita a licenca de seu
texto; imagens e outros conteudos externos nao sao importados por este adapter.

A interface tem credito por fonte/revisao e aviso de extracao no link acessivel.
O ciclo admite dez obras por padrao, com orcamento de180s e intervalo global de1500ms
entre requisicoes. Resultados sao reavaliados em30dias para obras concluidas e
7dias para as demais. Uma falha ou formato nao suportado conserva evidencia
anterior; a ausencia de resultado nao prova que a obra nao possui arcos.

A execucao agendada de22/10/2026 publicou a geracao
bd13d323-253a-4184-b09b-2a37b081be43 com os tres arcos de Sword Art Online II.
O comprovante local e storage/app/catalog/probes/published-mediawiki-acceptance.json.
As classificacoes desses arcos permanecem unknown, independentemente dos dados
de filler de episodios obtidos em outra fonte.

## Validacao reproduzivel

`node scripts/probe-mediawiki-arcs.mjs --mal=21881 --episodes=24`

A consulta real de22/10/2026 resolveu Q132174430 e revisao Wikipedia1379275913:
Phantom Bullet1–14, Calibur15–17, Mother's Rosario18–24. Nomes e intervalos vieram
dos templates, sem tabela manual por anime. O probe grava hashes das tres respostas
e os registros derivados em storage/app/catalog/probes/mediawiki/21881-reader-proof.json.
Testes cobrem outra obra, P4086 ambigua, links hostis, numeracao absoluta distinta,
templates aninhados, repeticoes, lacunas, decimais e tabelas multiplas.
