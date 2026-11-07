# Validacao visual do catalogo em 22/10/2026

Verificacao anonima no navegador integrado, com dados locais reais e sem injetar
respostas. Recibo e hashes das capturas: storage/app/catalog/probes/catalog-ui-acceptance.json.

## Bootstrap vazio navegavel

Candidata privada bootstrap-verification-20261022, geracao723df33c-80dc-4aa7-8b1e-610cbe4e0243:
o explorer carregou36497animes visiveis ao guest, a busca Sword Art Online retornou
28resultados e o detalhe de SAOII abriu com24episodios sustentados pelos dados.
As344730obras do manifesto incluem publicacoes auxiliares e itens nao exibidos
nessa busca anonima; o contador do explorer nao representa o total da base.

## Arcos publicados e teclado

SAOII publicado na geracaobd13d323-253a-4184-b09b-2a37b081be43 exibiu tres arcos:
PhantomBullet1–14,Calibur15–17,Mother'sRosario18–24. Fonte/revisao e licenca
CC-BY-SA-4.0 ficaram no link acessivel; a classificacao dos arcos e desconhecida.
Tab alcancou o primeiro cartao com foco visivel; Enter abriu contexto ARC e
episodios1–14. Os cartoes agora sao botoes nativos em WorkArcCard, com rotulos
traduzidos. Nenhuma classificacao canon foi inferida a partir da divisao de arcos.

Capturas em storage/app/catalog/probes/: bootstrap-explorer-ui.png,
bootstrap-work-ui.png,public-arcs-keyboard-ui.png e public-arc-navigation-ui.png.
Build app-xd2SnKNw.js concluido com sucesso. A verificacao nao comprova coleta remota
de Jikan ou cobertura universal de arcos. Nenhuma publicacao publica foi feita pelo teste.

## Obra aberta acompanha nova geracao

Teste posterior com build app-D8DdX7IS.js: candidata local live-refresh-verification
preparada a partir da obra real do bootstrap, inicialmente sem arcos. Com a pagina
ja aberta, o script probe-live-catalog-refresh.mjs update aplicou a evidencia real
do cache MediaWiki, publicou nova geracao privada e passou na auditoria. Nao houve
consulta remota, resposta injetada no navegador, recarregamento ou troca de UUID.

A tela mudou de Episodios da Obra(24) para Arcos da Obra(3), com credito da fonte,
pelo mecanismo normal de atualizacao. Geracoes e798ea06-6dc1-474a-af17-aa5137b67051
e33b15ddc-7d17-4281-9141-8f150f6eba64, identidadec265fac4-2fe8-4df8-ad58-e2893cf57a8b.
Recibo: storage/app/catalog/probes/live-refresh-ui-acceptance.json. Capturas
live-refresh-before.png e live-refresh-after.png no mesmo diretorio.

O watcher consulta o manifesto pequeno a cada60s ou foco, com limite20s para essa
consulta. Nao inicia carregamento do legado numa sessao nova do catalogo particionado.
Consumidores legados explicitamente carregados continuam recebendo atualizacoes;
a gamificacao autenticada ainda precisa dessa migracao posterior. Preview local
mantem sua selecao ao limpar a URL e nao usa Parquet publico como fallback.

Testes concorrentes verificam que resposta antiga nao sobrescreve uma nova validada,
falha recente nao descarta resposta valida pendente, rollback posterior e permitido
e particao antiga nao expulsa cache atual. Esse teste visual cobre publicacao valida;
nao comprova recuperacao de toda falha de rede durante uma atualizacao ja aberta.

## Recuperacao de consulta503 sem outra geracao

Build app-Bi6VZKyJ.js e228testes aprovados. Uma candidata separada,
recovery-refresh-verification, usou a mesma obra real e cache de arcos. Depois da
publicacao privada auditada, seu indice SQLite foi temporariamente renomeado pelo
script probe-catalog-index-outage.mjs, restrito a esse diretorio. A API retornou503
real; a pagina aberta manteve os24episodios conhecidos e indicou Atualizacao pendente.

O proprio script restaurou o indice apos120s, conferindo seu SHA-256. Sem outra
publicacao, reload ou resposta injetada, o proximo ciclo do frontend exibiu os3arcos
e removeu a pendencia. A geracao permaneceu152dd854-227b-48ce-a7a6-3faa97dc3ae4.
O catalogo publico e o coletor agendado nao foram alterados pelo teste de falha.
Recibo com hashes das capturas e comprovantes de restauracao:
storage/app/catalog/probes/work-recovery-ui-acceptance.json. Capturas recovery-before.png,
recovery-pending.png e recovery-after.png no mesmo diretorio.

O resolvedor agora distingue falha de consulta de resultado nulo confirmado. Um404
de obra nao restaura dados do legado; migracao provisoria so e admitida quando falta
o manifesto unificado. Falhas pendentes sao retomadas no ciclo existente, mesmo sem
troca de revisao. Respostas atrasadas e sessao descartada nao alteram o contexto novo.
Manifesto e lookup tem limite20s; particoes possuem limite60s. Testes deterministas
cobrem esses fluxos de propriedade/retomada; a prova visual acima cobre a falha503
local do indice, sem prometer disponibilidade de provedores externos.
