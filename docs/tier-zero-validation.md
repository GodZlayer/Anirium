# Validacao do tier 0

Rodada local de22/10/2026, sem conta, em http://localhost:8080.
Estado: **ainda nao aprovado**. Esta rodada testa a experiencia; nao reabre a
implantacao da base nem modifica suas obras.

| Criterio | Evidencia atual | Resultado |
|---|---|---|
| Entrada sem login | Navegador mostra Entrar com Google e catalogo acessivel | Passou |
| Busca publica | Sword Art Online retorna28resultados | Passou |
| Busca vazia | Termo inexistente mostra0/Nenhuma obra encontrada, paginacao desativada | Passou |
| Paginacao | UI mudou para pagina2; API retornou12+12obras sem IDs repetidos na mesma geracao | Passou nas duas primeiras paginas |
| Obra e link legado | /view/work/21881 abreSAOII,24episodios e3arcos | Passou |
| Link inexistente | /view/work/2147483647 mostra Obra nao encontrada | Passou |
| Universo | SAO carrega21obras conectadas, incluindo alternativas e resumos | Passou na amostra |
| Arcos e episodios | PhantomBullet1–14/Calibur15–17/Mother'sRosario18–24, fonteWikipedia; abreARC/EPISODE | Passou na amostra |
| Teclado | Cartoes de universo corrigidos para button; Enter abre obra; Enter abre arco | Corrigido e retestado |
| Ausencia de sinopse | Removido slogan sobre canon/streaming; mantida sinopse real nos6idiomas | Corrigido,2testes passaram |
| Interacoes privadas | GuestTierZeroTest verifica9bloqueios401; dock de contexto desativado | Passou nas rotas testadas |
| Discussao publica | Episodio mostra0mensagens e exige login para comentar | Passou no estado vazio |
| Calendario | Visitante ve7obras com horario documentado na quinta-feira | Passou na amostra |
| Idioma e tema | Navegacao/titulos mudam; calendario permanece parcialmente em portugues | Parcial |
| Atualizar pagina | Reload do contexto retorna ao lobby | Falhou na preservacao de contexto |
| Tela estreita | Cabecalho cabe em703px e375pxCSS; larguras menores ainda exigem ajuste | Parcial |
| Foco no carrossel estreito | Cartao focado fica inteiro na trilha, headerTop0 e nenhum scroll vertical | Corrigido e retestado em639pxCSS |
| Reproducao | Aviso de configurar player da conta, sem licenca presumida e sem video nativo para guest | Corrigido e retestado |
| Favoritos no calendario | Sete botoes desativados para guest, rotulados Entrar com Google; handler exige conta | Corrigido e retestado |
| Filtros/ordenacao | Explorer unificado oferece somente busca/paginacao | Falhou por ausencia |
| Atualizacao/falhas | Existem provas anteriores isoladas; falta fechar escopo desta rodada | Pendente |

## Verificacoes executadas

-26testesPHP deCanonicalRoutesAndContext/CatalogSearch/CatalogLibrary/CommunityAddons:
 147assertions, todos passaram.
-2testesPHP GuestTierZeroTest:9assertions, todos passaram, sem criar contas.
-233testesNode passaram no container, semskip, incluindo2regressoes de sinopse.
-BuildDocker aprovado:2595modulos,4m52, app-CB_dCqHK.js/app-31FZ_UfC.css.
 Avisos preexistentes de chunks grandes/import dinamico ineficaz.
-Navegador confirmou o novo script app-CB_dCqHK.js antes do reteste de teclado.

Capturas em storage/app/catalog/probes/tier-zero: universe-before.png,
narrow-header-before.png, missing-work.png, episode-before.png eguest-discussion.png.
universe-keyboard-after.png registra a versao nova em703px; nao comprova que o
foco no carrossel fica visivel. O DOM confirmou focoBUTTON emSAOII:Debriefing,
mas a captura mostrou outros cartoes e cabecalho cortado.
As capturas anteriores nao representam correcoes que ainda nao foram feitas.

Proximo trabalho: corrigir apresentacao de reproducao, responsividade, favoritos
de visitante, preservacao do contexto e filtros; depois concluir paginacao,
classificacao/filtro, dados ausentes e verificacao final. Nao aprovar tier0
apenas pela suite verde enquanto houver falhas observadas na interface.

## Probe reproduzivel das rotas publicas

`node scripts/probe-tier-zero.mjs` consulta somente a instancia local, sem cookie
de conta, e grava storage/app/catalog/probes/tier-zero/backend.json. Confere
paginacao, IDs distintos, midia anime, busca vazia, aliases permanentes,404 e
bloqueios401. Nao enviaPOST nem altera dados; nao substitui a verificacao visual.

## Segundo lote

Build app-dWy_-VAo.js/app-BPjN5l_k.css passou (2597modulos,4m49).233testesNode e
os2testesPHP GuestTierZeroTest/9assertions passaram. O probe real backend.json
passou em9GETs, incluindo as duas paginas com12obras distintas cada, aliasUUID,
404 e401. pagination.json confirma mesma geracao e0IDs repetidos.

ModularPlayerBox agora usa PlayerLaunchState com strings6idiomas. Visitante nao
renderiza plugin mesmo se o registry conservar um player anterior. O estado
Anirium+ informa a dependencia do Service sem afirmar que esta conectado.
Nenhuma permissao de fonte e inferida de streaming_links. O reteste DOM observou
o aviso esperado,0elementosvideo e ausencia das antigas afirmacoes.

O cabecalho de703px passou: login ficou entre657e691px. Em375px, ainda houve
corte de1.64px na borda direita. Foi diagnosticado tambem um deslocamento vertical:
o main doLobby tinha638px enquanto ContextView forçava670px, gerando scrollTop32
ao focar elementos. A correcao de altura e o ajuste final de espacamento mobile
estao em verificacao; ainda nao constituem aprovacao responsiva.

## Reteste da altura e foco

Build app-BEtmjwm8.js/app-BbxEWAn7.css passou (2597modulos,5m31). ContextView usa
a altura disponivel doLobby, sem somar novamente o rodape. Depois deTab e do fim
da animacao, o cartao focado ExtraEdition ficou inteiro dentro da trilha, com
headerTop0 e0containers rolados verticalmente. focus-acceptance.json e
universe-focus-fixed.png registram medidas e captura da nova versao.

header-375-acceptance.json confirma375pxCSS, todos os controles dentro da tela.
O navegador usa escala1.1; foram solicitados413px para obter375pxCSS efetivos.
Nao confundir dimensao solicitada com largura medida. O teste adicional em341px
continuou cortando o login; o modo mais compacto ainda precisa de ajuste.
Viewport temporaria restaurada e aba de teste encerrada.

## Busca e restauracao: lote em verificacao

Os testes context-navigation e arc-navigation cobrem checkpoint publico sanitizado,
precedencia de links explicitos, Back, limite de historico e derivacao do arco pelo
intervalo do episodio. Episodio16 pertence a Calibur mesmo com indice anterior0;
episodio18 pertence a Mother's Rosario. Reteste visual do bundle novo permanece pendente.

CatalogSearchTest passou11testes/79assertions, incluindo combinacao de filtros,
ordenacao, isolamento adulto e facets. O probe local backend.json passou11GETs:
filtros combinados, ano, facets, sort invalido422 e bloqueios401. A consulta com
facets levou17.57s nesta maquina; nao constitui aprovacao de desempenho.

A busca da interface recebeu seletores de status, formato, genero e ordenacao,
limpeza conjunta e reset da pagina ao alterar criterios. As opcoes vem do servidor;
facets sao reaproveitadas durante a consulta e invalidadas ao mudar a geracao.
Ainda exige build e reteste visual de combinacao, limpeza e layout estreito.

catalog-search-request.test.mjs passou3testes: resposta valida/503/corrompida,
timeout que aborta a requisicao e cancelamento durante a decodificacao. O hook
limita espera a25s e nao publica resposta de busca substituida. Indisponibilidade
agora informa falha sem trocar silenciosamente para a base antiga.
Os9testes focados de busca/navegacao passaram; tier0 continua nao aprovado.
