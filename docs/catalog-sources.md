# Contratos das fontes do catálogo

O contrato executável fica em `scripts/catalog/source-contracts.mjs`. Fontes sem
conector validado permanecem desativadas. Dados desconhecidos não são inventados.

| Fonte | Dados admitidos | Limitações e procedência |
|---|---|---|
| MAL | Metadados, datas com precisão original, relações tipadas entre obras | Sem arcos ou canon/filler. `related_anime` e `related_manga` dependem do endpoint de detalhes. Cache antigo não comprova resposta atual. |
| Jikan | Metadados, temporadas, relações e episódios documentados | Espelho do MAL; não constitui fonte independente durante manutenção do upstream. Limite documentado: 60/min e 3/s; cliente usa intervalo conservador. |
| anime-offline-database | URLs de identidade, metadados básicos, referências entre obras | ODbL/DbCL; `relatedAnime` não informa prequel/sequel. Notas são agregadas e não substituem a nota MAL. Múltiplos IDs do mesmo provedor são conflitos de granularidade. |
| MangaBaka | Identidade própria e IDs externos, metadados de publicações, contagem de capítulos/volumes | Uso não comercial; CC BY-NC-SA para dados próprios, termos originais para dados de terceiros. Contagem não gera índices de capítulos. `relationships_v2` preserva o original; `to_series_id` e `relation_type` foram validados na API real. Texto de volumes adaptados não vira arco. |
| AniZip | Índices e títulos de episódios, datas, mapeamentos | Validar `mappings.mal_id`. Número local MAL é diferente da posição TVDB. Especiais e contagem desconhecida não aumentam o total MAL. |
| AnimeFillerList/snapshot | Categorias de episódios com mapeamento explícito para a obra | Conflitos e intervalos fora dos limites ficam separados. Ausência de classificação não significa canon. `canon` não é reinterpretado como manga canon. |
| Kitsu | Leitor de obras, mappings e relações com paginação | Leitor validado com SAO real; automação desativada até verificar condições de redistribuição. Contrato em `source-contracts/kitsu.md`. |
| Fribb, Anime-Lists | Conectores previstos para correspondências | Desativados até validar contrato e condições do conector. Referências fornecidas por snapshots podem ser preservadas sem consultar a API. |
| Wikipedia/wikis | Arcos com obra e intervalos explícitos | Wikipedia habilitada somente no formato restrito Story/Episode com P4086, revisão e licença; outras wikis permanecem sem conector admitido. Não inferir arcos a partir de títulos ou sinopses. |
| AniList direto | Nenhum acesso em massa habilitado | Depende de autorização e termos aplicáveis. |

## Evidências e operação

- Snapshots guardam URL, versão, checksum publicado, SHA-256 local e data de origem.
- O arquivo bruto permanece intacto. O leitor MangaBaka normaliza controles literais
  encontrados dentro de strings e informa a quantidade no relatório da importação.
- UUID é permanente. Títulos nunca são usados como prova suficiente de identidade.
- Os links antigos continuam resolvidos por aliases; IDs de anime e publicações não
  compartilham namespace, mesmo quando o número externo coincide.
- Cada geração possui partições e hashes; o manifesto só muda após a releitura das
  partições. Uma candidata privada não substitui o catálogo publicado.

## Comandos da candidata

Executar no diretório Laravel. Os comandos escrevem em `storage/app/catalog/unified-candidate`;
não substituem a base pública. Na primeira execução, `bootstrap` exige armazenamento
sem obras nem identidades. O mesmo comando pode retomar esse diretório depois de
gravar uma geração, desde que bootstrap-inputs.json conserve a prova do início
vazio e o diretório de fontes isolado original. A geração retida passa pela auditoria
antes da reutilização; o marcador e sua data não são renovados. Um diretório comum
de sync, sem essa prova, não pode ser reapresentado como bootstrap vazio.

```sh
php artisan catalog:candidate bootstrap --output=storage/app/catalog/bootstrap-candidate
php artisan catalog:candidate sync
php artisan catalog:candidate audit
php artisan catalog:candidate status
```

`bootstrap` e `sync` verificam snapshots independentemente e reutilizam downloads
validados. O registro de identidades tem backup; gerações anteriores são mantidas.
Uma sincronização importa a geração anterior antes de incorporar fontes, impedindo
que uma fonte indisponível remova obras já publicadas na candidata.
`audit` verifica hashes, mídia, UUIDs, aliases, dimensões e revisão das partições.

Os comandos usam até 6 GiB de heap durante a construção (`CATALOG_HEAP_MB`,
configurável entre 1024 e 16384 MiB). Isso não reserva essa memória nem altera
o limite do navegador. Downloads têm retomada e checksum; uma importação
normalizada completa possui checkpoint próprio. Snapshots já incorporados são
identificados por digest e receita de importação. Relatórios JSONL são gravados
em lotes para reduzir operações na pasta compartilhada do Windows.

O índice SQLite é um artefato privado derivado por geração, para busca e resolução
de aliases no Laravel. Não é memória operacional nem um serviço adicional.
O navegador recebe resumos paginados e busca a partição de detalhes por referência,
validando seu hash. O índice global de aliases não precisa ser baixado.

Em ambiente `local`, `/?tab=explore&catalog=candidate` permite revisar a candidata.
Os endpoints de prévia recusam acesso fora desse ambiente e não expõem registro,
índice SQLite ou relatórios privados.

Metadados da mesma fonte só substituem valores quando a data observada avança.
Valores divergentes sem prioridade comprovada permanecem no relatório privado de
conflitos. A data do download não comprova atualidade. Relações desconhecidas e
de fontes diferentes permanecem armazenadas.

O enriquecimento consulta MAL por namespace de anime/publicação, conserva caches
antigos com suas datas e acrescenta referências tipadas à próxima fronteira. A
descoberta de ranking MAL tem checkpoints por página; temporadas Jikan são uma
fonte complementar. MAL não fornece arcos nem classificação canon/filler.
AniZip e o snapshot de classificação são etapas independentes; falhas preservam
o que já estava validado. `Retry-After` pode suspender uma fonte entre execuções.

A publicação pública permanece separada da candidata. Ainda precisam ser
concluídos os contratos e conectores desativados da tabela, a migração integral dos
consumidores e a aprovação das verificações de conteúdo antes da promoção pública.
Capítulos e volumes possuem contagens quando fornecidas; não são fabricados índices.

## Validação real de bootstrap em 21/10/2026

Sem registros ou identidades unificados anteriores, o processo importou 38.250
entradas do snapshot de anime e percorreu 565.118 registros MangaBaka: 306.564
ativos, 258.551 mesclados e 3 excluídos. Gerou 344.490 obras em 70 partições,
auditadas por hash, identidade, aliases e mídia: 37.997 animes, 277.682 mangás e
28.811 novels. Houve 324 rejeições/conflitos explícitos. Foram reutilizados os
snapshots verificados; esse ensaio não usou o catálogo publicado como semente.

Esse resultado valida carga e publicação privada, não cobertura integral de todas
as fontes. O ensaio precedeu a integração das etapas suplementares nessa candidata:
seu relatório registra zero documentos de episódios. A candidata derivada da base
anterior preservou 774 documentos, somando 32.821 episódios.

## Referências das fontes

- https://myanimelist.net/apiconfig/references/api/v2
- https://docs.api.jikan.moe/
- https://github.com/cedya77/anime-offline-database
- https://mangabaka.org/data/database
- https://mangabaka.org/data/api


## Ciclo autonomo e publicacao

`php artisan catalog:candidate auto` executa snapshots, conciliacao, descoberta,
complementacao, auditoria e promocao, sob a mesma trava do sincronizador antigo.
O comando `sync` continua produzindo apenas candidata privada. `status` mostra
checkpoint e o resultado persistente em `automation.json`; falhas nao sao sucesso.

A descoberta oficial consulta temporada atual, proxima temporada e ranking
upcoming. Em 21/10/2026 a consulta real obteve 191, 62 e 522 registros,
respectivamente, com 687 identidades distintas. Cada escopo tem cache de seis
horas e checkpoint por pagina; uma pagina incompleta nao substitui o ultimo
escopo valido. Jikan permanece uma consulta independente.

O tempo de leitura local dos caches nao consome o orcamento de consultas. MAL
reserva 90% das consultas e do tempo para anime. A fila intercala duas obras
ativas com uma historica, para atualizar lancamentos sem abandonar o acervo.
Ausencia de um campo opcional relacionado nao invalida uma resposta MAL valida.

A promocao verifica hashes, identidades, aliases e todos os documentos de
episodios. Compara com a publicacao anterior e com o Parquet legado; perda de
obra, alias, documento ou numero de episodio bloqueia a troca. Copia os arquivos
imutaveis antes do manifesto; indice SQLite e registro permanecem privados.
A auditoria registra cobertura sem declarar completude por termino da execucao.
`catalog:candidate rollback` restaura o manifesto anterior validado; na primeira
promocao, pode restaurar o legado validado. Arquivos das versoes antigas ficam
preservados. Um processo interrompido antes da troca mantem a versao publicada.

O produto navega animes. Manga e novel sao dados auxiliares para adaptacoes e
continuidades; relacao de adaptacao nao comprova canonicidade automaticamente.


A grade MAL declara horario do Japao na documentacao oficial. O adapter conserva
esse dado bruto e converte explicitamente para UTC; a interface converte UTC para
o fuso do usuario. Uma amostra real de 191 registros da temporada trouxe 99 grades
validas. Horario ausente nao recebe meio-dia nem distribuicao pelo ID. Uma grade
semanal e uma previsao, nao prova transmissao em andamento ou episodio ja exibido.
Home e calendario consultam feeds da geracao ativa. Obras com ano/data futura nao
entram como lancamento em exibicao. O indice tem acesso especifico para status e
ordenacao temporal, sem exigir varrer o catalogo em cada acesso.

Depois de um ciclo validado, a retencao mantem geracoes atual/anterior e uma extra,
alem do checkpoint de importacao referenciado e os dois mais recentes. Ela atua
somente em nomes e caminhos de artefatos gerados, rejeita links simbolicos e
preserva diretorios com conteudo desconhecido. Snapshots de origem e o Parquet
legado permanecem recuperaveis.


## Registros mesclados e referencias herdadas

O parser preserva `merged_with` numerico como redirecionamento externo MangaBaka,
com namespace de publicacao e prova pelo digest do snapshot. A auditoria real de
565.118 registros verificou258.551redirecionamentos:258.534terminam em ID ativo,
17permanecem pendentes e a maior cadeia tem3passos. Nenhum ciclo ou contrato
invalido foi admitido. Referencias antigas podem resolver relacoes sem criar uma
nova obra. UUIDs estabelecidos conflitantes continuam separados e reportados.

Saude de provedor e identidade sao campos distintos de metadados. Uma resposta
MAL404sem cache valido, sem metadados de origem e sem referencias independentes
coloca a referencia legada em verificacao: ela sai da descoberta, mas conserva
UUID, aliases e progresso. Erro503/429/timeoutnao comprova identidade errada.
Evidencia valida posterior restaura a descoberta automaticamente. Um exemplo
real herdado usa100130comoMALparaKatsugeki; o snapshot distingueAniList100130
deMAL36419. Essa divergencia nao autoriza fundir obras apenas pelo titulo.


## Reparacao e observacao da rotina

`catalog:candidate repair` reaplica os dados ja coletados, sem baixar snapshots ou
consultar provedores, e gera uma NOVA versao das particoes e do indice. Ela passa
pelas mesmas verificacoes antes de publicar. Os helpers de migracao e reindexacao
usam esse caminho; nunca sobrescrevem o indice de uma geracao em uso. A receita de
importacao separa alteracoes de normalizacao das alteracoes de busca, status e
publicacao, evitando reimportar565milregistros por uma mudanca de relatorio.

O status informa ultima execucao e publicacao, cobertura e fontes, e distingue
processo vivo de registro antigo. Em Linux compara hostname, PID e inicio do
processo; sem prova suficiente informa observacao nao confirmada. Uma auditoria
registrada se refere ao momento de publicacao e precisa corresponder a mesma
revisao; nao e apresentada como verificacao continua dos arquivos. Os contadores
de lote sao emitidos a partir das consultas executadas, nunca por percentual
simulado. A rotina agendada retoma as pendencias pelos checkpoints e caches.


Benchmark no Docker com10milobras reais: leitura1868ms, construcao do indice4410ms,
consulta17ms, arquivo32.95MB. O plano SQL usou `feed_release` como indice de
cobertura. Isso valida a amostra; o desempenho da publicacao completa deve ser
medido separadamente. SQLite e construido em diretorio temporario nativo isolado,
fechado e copiado com verificacao dehash antes do rename no destino; uma geracao
existente nao pode ser sobrescrita. Caminho de limpeza e validado antes de remover
apenas o diretorio temporario criado pela propria execucao.


O limitador de requisicoes usa cache de arquivos separado do banco da aplicacao;
incrementos usam trava para nao perder contagens concorrentes. O limite das rotas
permanece60por minuto. SQLite da aplicacao tem espera limitada a5segundos quando
outra transacao estiver gravando. O bootstrap do container prepara os diretorios
de cache com o usuario doPHP-FPM; os testes usam caches isolados e nao criam
arquivos no cache de producao. Testes de4processos confirmaram40incrementos sem
perdas, expiracao do limite e consulta do catalogo sem depender do banco de cache.


A contagem total de episodios nao gera um indice ficticio. A navegacao usa os
numeros explicitamente presentes no documento de episodios ou em classificacao
validada por obra; lacunas permanecem lacunas. Classificacoes conflitantes nao
criam numeros navegaveis por si mesmas. O total continua sendo metadado da obra.


A biblioteca resolve referencias de conta por namespace e aliases, preservando
UUIDs e wrappers antigos. Conclusao de episodio/universo nao equivale a conclusao
da obra. Preferencias com a mesma referencia normalizada usam a interacao mais
recente, evitando restaurar um favorito removido por uma entrada antiga. A leitura
autenticada pelo indice unificado esta descrita abaixo.


GET /api/account/library?view=bookmarks|history|ratings&page=1 retorna24obras por
pagina a partir das preferencias da conta autenticada. Resolve aliases no indice
privado em lotes de250, deduplica porUUID e usa a preferencia mais recente.
A biblioteca nao depende de MAL nem da presenca da obra no Parquet legado.
Referencias pendentes continuam salvas e sao sinalizadas; links pessoais em
verificacao permanecem acessiveis. Respostas sao private/no-store, sem parametros
para escolher outra conta. Conteudo adulto exige permissao persistida e adult=1.
As abas carregam sob demanda e invalidam resultados na troca de conta/geracao.
A leitura nao modifica favoritos, progresso, notas ou comentarios no banco.


Contextos sociais de obra e episodio consultam os aliases explicitamente vinculados
ao mesmo UUID. A leitura de comentarios preserva os registros antigos; preferencias
continuam restritas a conta autenticada. Uma nova escrita por outro alias atualiza
a preferencia existente mais recente, mantendo seu target_id e campos nao alterados.
Nao ha fusao por titulo, por numero compartilhado entre midias ou por indice de arco.
Episodios preservam o numero local; arcos/temporadas sem mapeamento comprovado
continuam em seus contextos originais. Indice indisponivel mantem a busca exata.
A interface de discussoes nao gera autores, mensagens ou datas ficticias, nem
considera comentario enviado antes da confirmacao do servidor. Falhas mantem
o texto para nova tentativa e nao concedem XP por envio nao confirmado.


O comando status e o relatorio de cada nova execucao incluem sourceReadiness para
todas as fontes, inclusive conectores desativados. A admissao automatica precisa
de enabled=true explicito no contrato. Estados de dados: data-available,
data-degraded, unavailable, no-data-observed e unobserved; disabled/not-admitted
sinalizam gates de contrato ou implementacao. Cache valido nao comprova acesso
remoto naquele instante. Contagens e timestamps da coleta ficam separados dessa
avaliacao. Erros preservam apenas statusHTTP e categoria controlada (timeout,
rate-limited, access-denied, service-unavailable, network-error, invalid-response),
sem mensagens privadas ou corpo bruto da resposta. Falhas antigas sem categoria
continuam unclassified; nao sao retroativamente reinterpretadas.


A descoberta sazonal Jikan salva paginas validadas atomicamente por escopo e
geracao, retoma paginas pendentes e rejeita cache parcial corrompido. Paginas
reaproveitadas conservam seu source_checked_at original; o termino da retomada
nao renova artificialmente esses registros. Geracoes de checkpoint vencem apos
seis horas, e paginas de outra geracao sao ignoradas. Arquivos fixos por
escopo/pagina sao reutilizados, evitando uma pasta nova a cada tentativa. Uma
coleta parcial nunca substitui o ultimo escopo completo validado.


Bootstrap usa armazenamento e caches de provedores isolados em <output>/sources.
AOD e MangaBaka sao insumos de snapshots verificados, nao sementes de identidades
do catalogo anterior. O modo vazio nao importa o Parquet legado, nem copia
documentos de episodios da publicacao. bootstrap-inputs.json registra contagens
iniciais de identidades/obras e se o cache isolado ja existia, preservando a primeira
observacao em retomadas. Um teste com cache global AniZip preexistente verifica
que esse cache nao e consumido pelo bootstrap isolado. O bootstrap de22/10/2026
concluiu com344730 obras,70particoes e auditoria de integridade verificada em
storage/app/catalog/bootstrap-verification-20261022. Isso comprova aquela execucao;
nao substitui a verificacao das alteracoes de conectores posteriores.


Uma divergencia MANGA/NOVEL de fonte complementar nao descarta um pacote inteiro
quando os IDs externos explicitos apontam para um unico UUID estabelecido. Nesse
caso a classificacao interna existente e preservada, as referencias passam pelas
mesmas verificacoes de granularidade e o conflito de tipo fica registrado. Uma
classificacao MAL direta ainda exige sua evidencia para reclassificar. Dois UUIDs
estabelecidos, midias anime/escrita ou IDs contraditorios de um mesmo provedor
continuam impedindo a conciliacao automatica. Titulos semelhantes nao participam
dessa decisao. Conflitos rejeitados incluem referencias e tipo, nao apenas titulo.

O complemento de episodios Jikan roda depois do AniZip, inclusive para completar
lacunas em documentos existentes. Tem checkpoint por pagina, orcamento HTTP,
cooldown compartilhado e composicao com procedencia por campo e conflitos preservados.
O contrato e seus limites estao em [jikan-episodes](source-contracts/jikan-episodes.md).
O teste real de22/10/2026 registrou timeout, uma consulta, zero documentos e uma
nova tentativa prevista; nao houve alteracao do manifesto publico pelo probe.
Aceitacao de conteudo real continua pendente enquanto a fonte nao responder.

## Fronteira recursiva de relacoes MAL

O enriquecimento segue IDs explicitos de related_anime/related_manga, quando
presentes na resposta, dentro do mesmo orcamento de consultas e tempo. Novos
destinos do mesmo namespace entram no ciclo atual; IDs ja conhecidos nao geram
consulta repetida por causa de ciclos no grafo. Campos ausentes na resposta nao
provam ausencia de adaptacoes ou outras relacoes.

Os caches verificados do provedor sao a fronteira persistente: sao gravados antes
de expandir os destinos. Um reinicio anterior a publicacao das rows reconstrui a
cadeia desses caches, sem outra fila/banco e sem refazer chamadas frescas. Anime e
publicacoes escritas conservam namespaces separados. Destinos escritos descobertos
na fase anime entram na fase escrita seguinte. Um retorno para anime depois dessa
fase fica registrado como deferredCrossMedia e completo=false ate o proximo ciclo.
discoveredReferences conta referencias incorporadas a cada fila, nao tamanho de
universo, canonicidade ou prova de cobertura completa do catalogo.

429 interrompe a fila e preserva Retry-After. Falha de acesso401/403 conserva os
caches parciais verificados e os contadores de tentativas, sem classificar IDs como
invalidos por falha de credencial. O grafo de descoberta inclui other e tipos
desconhecidos; a politica separada de universos continua recusando fusao por other,
personagens ou crossovers.

Prova local sem rede: `node scripts/probe-mal-relation-frontier.mjs --mal=11757`.
Em22/10/2026 percorreu27referencias a partir do cache de SAO,23com dados em cache,
21desses antigos e4sem cache. Nao alterou o cache de origem nem o manifesto publico;
isso nao declara que as27obras formam um unico universo ou que o MAL estava acessivel.

## Progresso da auditoria e publicacao

O comando automatico grava checkpoints atomicos em progress.json tambem depois
de construir a candidata: carregamento do registro, auditoria da candidata,
carregamento e auditoria da versao anterior, comparacao do conteudo, copias,
auditoria do destino, troca do manifesto e retencao. Cada auditoria informa
lookup, particoes verificadas/total, obras verificadas/total, indice e revisao.
Os contadores correspondem a verificacoes concluidas, sem estimar porcentagem
global ou prazo. Uma etapa longa permanece visivel ate terminar ou falhar.

manifest-published so aparece depois da gravacao do manifesto publico; published
final aparece depois da retencao. Uma verificacao interrompida ou um checksum
invalido nao emite verified. Esses eventos nao substituem o recibo privado de
auditoria nem autorizam pular a verificacao de perda de conteudo.

Validacao local: testes publish-generation, promote-candidate e runtime-status
com arquivos Parquet/SQLite reais em diretorios temporarios, incluindo corrupcao
e interrupcao antes do commit. A mudanca nao atualiza codigo ja carregado por uma
execucao em andamento; passa a valer na proxima execucao normal.

## Procedencia do snapshot de classificacao

A classificacao conserva a pagina original AnimeFillerList por obra e a data
generated do snapshot, nunca a data recente de download como observacao dos dados.
A cadeia via registra digest, URL, repository_license e repository_attribution
(cedya77 e manami-project), separadamente de upstream. A licenca upstream permanece
null e terms_verified=false enquanto suas condicoes nao estiverem verificadas.
Isso registra uma pendencia; nao constitui permissao presumida nem proibicao.

O README do repositorio distingue a licenca do banco e os direitos dos provedores:
https://github.com/cedya77/anime-offline-database#licence.
Caches anteriores sao normalizados em memoria sem renovar checkedAt/observedAt,
alterar bytes, rebaixar a verificacao de hash ou exigir nova consulta. Evidencias
ja publicadas continuam preservadas; novas aplicacoes carregam a cadeia completa.

## Operacao local sem acompanhamento do Codex

O cron chama o scheduler Laravel a cada minuto; o Laravel inicia o ciclo do
catalogo a cada duas horas, com exclusao de execucoes concorrentes. O Codex nao
participa dessas execucoes. A maquina, a internet e o Docker precisam estar
disponiveis; uma parada manual do Docker nao pode ser recuperada pelo catalogo.

docker/supervise-app.sh acompanha cron e PHP-FPM: recupera cron encerrado e
encerra os filhos ao desligar. Se PHP-FPM terminar, o supervisor termina tambem,
permitindo a politica Docker restart: unless-stopped recuperar o container.
A supervisao nao inicia escritores adicionais nem remove travas do Laravel.

Validado em22/10/2026:231testes Node passaram dentro do container, incluindo
falha de cron/recuperacao, falha de PHP/limpeza. Apos aplicar a inicializacao,
uma falha real controlada de cron recuperou PID10 para55 sem parar o site.
Pagina inicial e manifesto responderam200; publicacao cbd2e94a-8dba-4fc9-ad7c-1e64eea8d6c4
preservada. Prova HTTP em storage/app/catalog/probes/supervised-runtime.json.
Isso verifica operacao e recuperacao local, nao completude de fontes externas.
