# Revisão do contrato de dados, identidade e apresentação

Data: 25/10/2026. Estado: **não conforme; revisão em andamento**.

## Contrato que está sendo verificado

Todas as telas e estados existentes seguem o mesmo contrato: dados de uma entidade própria, relações explícitas entre IDs, textos por chave de idioma e aparência por tokens do tema. Uma mudança de dados, idioma ou tema não exige editar um componente por obra. Manter o desenho existente.

Código continua contendo geometria, algoritmos, contratos de protocolo e chaves de acesso. Isso não autoriza títulos, sinopses, horários, relações, rótulos ou cores específicos embutidos nos consumidores. Definições centrais de tokens e dicionários são dados de configuração; seus valores não são equivalentes a cores e textos escritos diretamente em uma tela.

## Escopo e evidência

- O container `anirium_app` monta `C:/Users/santo/Documents/Anirium-App` em `/var/www/html`. Esta é a implementação Laravel/React servida. Não confundir com o checkout histórico Animeflix ou com cópias do Service.
- Entradas: `resources/js/app.tsx`, `Pages/Lobby.tsx`, `Pages/ContextView.tsx`, `resources/views/app.blade.php`, CSS e rotas.
- O inventário reproduzível inclui todos os arquivos JS/TS/TSX/MJS/JSON dessas pastas, mais Support, Http e routes. Cada arquivo recebe hash SHA256 e referências de linha.
- Comando: `node scripts/audit-whitecontent.mjs`.
- Resultado completo: `storage/app/architecture-audit/whitecontent.json`.
- Resultados lexicais são candidatos, não uma contagem de bugs. Por exemplo, comparações SQL `<>` não são textos JSX; comentários que citam Bleach não são conteúdo exibido.
- Esta revisão de fonte não comprova equivalência com o bundle servido nem funcionamento visual em todos os estados. Essas verificações permanecem abertas.

## Achados confirmados por leitura dos caminhos

| ID | Problema | Evidência atual | Correção necessária, mantendo o design |
|---|---|---|---|
| WC01 | A homepage escolhe obras, não os três episódios exigidos. | `app/Support/CatalogSearch.php:91`: feed seleciona `works`, restringe RELEASING e limita a três summaries. | Consultar EP IDs com lançamento conhecido <= agora, ordenar por instante e hidratar os dados de suas obras por relação. Permitir dois EPs da mesma obra se estiverem entre os três últimos. |
| WC02 | Ordem do feed admite data alternativa de início da obra; não exige o horário do episódio já ter passado. | `CatalogSearch.php:103`: ordenação usa latest_episode_at ou start_date. | Usar exclusivamente o instante do EP elegível. Dados insuficientes não geram um EP substituto. |
| WC03 | Página aberta não atualiza por passagem do horário. | `resources/js/lib/useCatalogFeed.ts`: refresh inicial e evento de geração, sem atualização pelo relógio. | Reavaliar na próxima transição relevante e ao voltar à aba, sem depender de nova publicação do catálogo. |
| WC04 | Homepage mantém um caminho alternativo por lista de obras. | `Pages/Lobby.tsx:120-129`: fallback de RELEASING com slice(0,3). | Um único contrato de feed por EP ID; erro e vazio devem ser estados reais, sem trocar a regra de seleção. |
| WC05 | Explorar depende de rede em cada filtro. | `lib/useUnifiedCatalogSearch.ts`: timer de 300 ms e requestCatalogSearch; `UnifiedCatalogExplorer.tsx` usa esse hook. | Índice local próprio para os campos de filtragem. A digitação filtra imediatamente; detalhes pesados continuam sob demanda por ID. |
| WC06 | Títulos são alterados por tabela particular no código. | `lib/parquetCatalog.ts:65` PORTUGUESE_TITLE_MAP e `:156` mappedPt. | Títulos localizados na base por work_id+idioma; remover mapa por nome. Preservar proveniência antes de incorporar dados válidos. |
| WC07 | Sinopses específicas de obras estão no módulo de tema/tradução. | `lib/designStrings.ts:681` LOCALIZED_SYNOPSIS_MAP; `:817-819` seleção por título. | Sinopses pertencem à entidade, não ao dicionário da interface. Resolver por ID+idioma, sem correspondência por título. |
| WC08 | Imagem de outra origem é usada como substituta de capa. | `lib/parquetCatalog.ts`: URL fixa Unsplash no fallback de cover_image. | Capa vem da entidade; ausência usa estado geométrico neutro definido pelos tokens, sem se passar por imagem da obra. |
| WC09 | Contexto ainda fabrica referências pela posição visual. | `Pages/ContextView.tsx:352-356`: fallback com :arc-${index+1} e :ep-${number}. | IDs do grafo obrigatórios para ações/contexto. Índices podem organizar a tela, nunca identificar uma entidade. |
| WC10 | Player mantém contrato alternativo por MAL/índice. | `addons/player-pro/PlayerProComponent.tsx:129`, `:1123`, `:1395-1399`. | Receber work/episode/season IDs e relações do mesmo contrato; conversão de IDs externos fica no limite do Service/conector. |
| WC11 | Temas têm fontes visuais concorrentes. | `css/app.css:5-10`, `views/app.blade.php:11`, cores inline nas páginas e componentes. | Um registro de tema, aplicado também à raiz, fornece cores, gradientes, sombras e estados sem substitutos locais fixos. |
| WC12 | Textos de interface fora dos dicionários. | `UserProfileModal.tsx` abas; `ProfileSettingsTab.tsx:30`; `ProfileAddonsTab.tsx:199,284,330`; `DribbbleContentSwitchers.tsx:62,74`; player aria-labels. | Chaves de tradução para rótulos, tooltips, placeholders, acessibilidade, loading, vazio e falha. Não omitir textos menos visíveis. |
| WC13 | Cores por categoria/tier/estado estão dentro dos componentes. | `LolProfileBadge.tsx:54`, `UserProfileModal.tsx:41`, `ProfileGamificationHub.tsx:21`, `WorkArcCard.tsx:13`, `universeRelations.ts:21`. | Configuração por ID semântico de tier/estado/classificação, consumida pelo mesmo componente. Regras de dados não retornam cores literais. |
| WC14 | Estados da agenda têm texto português dentro da regra de horário. | `lib/airingSchedule.ts`, função getAiringStatusLabel. | Regra devolve estado e parâmetros de tempo; apresentação usa a chave do idioma. |
| WC15 | Estruturas muito grandes misturam coordenação, dados e renderização. | PlayerProComponent 1880 linhas; ContextView 1606; Lobby 557 no inventário atual. | Extrair por responsabilidade, preservando comportamento e cascas genéricas. Não criar um componente por anime nem redesenhar a navegação. |
| WC16 | Dicionários e temas existem como módulos TS no bundle. | `ThemeContext.tsx` importa THEME_PALETTES/I18N_DICTIONARY de designStrings. | Consolidar o contrato de chaves e entrega localizada de dados conforme a diretriz Parquet; não substituir por mais dicionários espalhados em componentes. |
| WC17 | O grafo SQL ainda não está ativo na base principal. | `php artisan catalog:identities status` em 25/10: users=2; nenhuma entidade de catálogo. Os dois eventos sem entity_id são globais, não episódios faltantes. | Aplicar a migração já preparada, preservar contas e validar o contrato da publicação consumida pelo site. Não declarar que a cópia candidata já alimenta todas as telas. |
| WC18 | Referências a um token inexistente. | `EpisodeDiscussionFeed.tsx:93,169`, `ContextView.tsx:692`: colors.textMain não existe em nenhum dos sete temas. | **Corrigido e compilado:** os três consumidores ativos usam textPrimary. Resta uma referência no protótipo não montado ArcReleaseTrack. |
| WC19 | Idioma do HTML não acompanhava o idioma selecionado. | O DOM local tinha lang=en com UI pt-BR; ThemeContext não atualizava lang. | **Corrigido e verificado no navegador:** seleção en-US/pt-BR atualiza document.documentElement.lang. |
| WC20 | Rodapé traz texto técnico e versões fixas. | Lobby/contexto renderizam ANIRIUM CORE v1.0 / LARAVEL 11 / INERTIA v2; ambiente atual tem outras versões. | Retirar informação técnica da apresentação primária ou usar metadados reais, em contexto apropriado e com rótulos por chave. Não substituir por outra versão fixa. |
| WC21 | Perfil redefine tier por e-mail no componente. | UserProfileModal.tsx:47 calcula admin pelo endereço; o backend já entrega effectiveTier. | Consumir identidade/capacidades da conta por ID. A política do único administrador permanece centralizada no servidor. |
| WC22 | Identidade de título/conquista é o próprio texto exibido. | ProfileGamificationHub usa key=t/onSelectTitle(t); telemetryXpLoop armazena títulos portugueses em unlockedTitles e compara customTitle por valor. | achievement/title IDs estáveis, rótulos por idioma e aparência por tokens. Não persistir uma tradução como identidade da conquista. |
| WC23 | Addon oficial possui descrições/manifests concorrentes. | playerProAddonBootstrapper, JSON player-pro/manifest e controller listUserAddons contêm definições próprias do mesmo addon_id; author/description diferem. | Um registro por addon_id alimenta conta, autorização e UI. O ID técnico player-pro é legítimo; a duplicação dos dados descritivos é a violação. O carregador externo não alcançado também tem configuração antiga: não presumir que esteja ativo. |
| WC24 | Estado de sessão é apresentado sem estado recebido. | ProfileSettingsTab mostra Ativa incondicionalmente, inclusive quando o fingerprint ainda apresenta Carregando. | Status da sessão/dispositivo vem de um resultado real por ID; loading/falha/ativo são estados distintos e localizados. |

## Verificação de registros e execução — segunda etapa

`node scripts/audit-whitecontent-registries.mjs` usa o transformador TS já instalado no Vite para ler os registros existentes, sem adicionar dependências. Produz `storage/app/architecture-audit/registries.json`.

- Cinco registros examinados: I18N_DICTIONARY (57 chaves), CATALOG_STRINGS (18), DISCUSSION_UNAVAILABLE (1 valor por idioma), PLAYBACK_STRINGS (6), UNIFIED_CATALOG_STRINGS (10). Os seis idiomas têm as mesmas chaves nos registros existentes. Isso não comprova qualidade da tradução ou cobertura de textos que estão fora deles.
- Sete temas com estrutura consistente. Antes da correção havia quatro acessos a textMain inexistente: três ativos e um no protótipo ArcReleaseTrack. Depois da correção restou somente o protótipo.
- Nove campos de tema não têm acessos literais nos consumidores: bgRaised, accentAmber, quatro cores de estado e os três raios. A falta de uso literal é um indício; acessos dinâmicos exigem análise antes de retirar qualquer campo.
- Perfil: abas, contadores, unidades, seleção de títulos e estado vazio ainda são textos de componentes. Há rolagem interna no modal, na biblioteca e nos títulos; a conformidade de viewport exige verificação própria, não se resolve ocultando conteúdo.
- Biblioteca: paginação/loading/falha já usam dicionários em ProfileCatalogLibrary. ProfileLibraryTab ainda contém mensagens vazias portuguesas e estilos fixos. IDs canônicos e adapters de aliases coexistem em libraryReferences; a migração exclusiva não está encerrada.
- Discussão: o estado de falha já possui seis traduções, porém cabeçalho, tipos de entidade, contador, placeholder e controles continuam portugueses. Conteúdo escrito pelo usuário deve permanecer dado da discussão, não virar tradução de interface.
- Addons: IDs da conta e mutations são explícitos e erros de toggle revertem o estado, mas falhas e mensagens ainda podem exibir frases fixas/códigos brutos. Não instalar/remover addons durante uma revisão de apresentação.

### Navegador real

- A aba pública aberta estava em modo visitante, com calendário e bundle antigo app-CSiaZ2pt.js. Logs reportaram HTTP 530 no manifesto; Explorar terminou em Search unavailable. Isso limita a evidência do domínio e não comprova falha do build local atual.
- No domínio, selecionar inglês traduziu a navegação, mas manteve CALENDÁRIO SEMANAL, SÁBADO, Seg/Ter e Às em português. O tema lightClean mantinha controles de dias com texto rgb(51,65,85) sobre painel rgba(10,10,15,0.6). A raiz do body permanecia rgb(10,10,12).
- Na aba temporária localhost:8080 foi confirmado o bundle app-DvSF57DK.js e reproduzida a mistura de idiomas no calendário. Busca spare me retornou quatro obras. A navegação para a obra abriu seus dados; detalhes mostravam total declarado 12 e nenhum EP catalogado pelo caminho disponível, coerente com a pendência de ativação do grafo, não prova de migração concluída.
- Após a correção de raiz/tokens, build app-2tpNF8KZ.js foi recarregado e conferido no DOM. Em lightClean: body background rgb(248,250,252), token bgBase #F8FAFC, texto rgb(15,23,42), lang en-US. Ao restaurar black+pt-BR: body rgb(11,11,13), token #0B0B0D, lang pt-BR.
- As correções da raiz **não** corrigem automaticamente as cores inline dos outros componentes. WC11 continua parcialmente aberto.
- Preferências originais de idioma e tema foram restauradas nas duas origens. A aba temporária foi fechada; nenhuma conta, favorito, comentário ou addon foi alterado. Perfil autenticado e player em reprodução não foram testados nesta etapa porque a sessão aberta era visitante. Suas violações descritas acima têm evidência de código, não de execução autenticada.

## Código encontrado cuja execução atual não está comprovada

- `Components/ArcReleaseTrack.tsx` inventa um total de 24 episódios quando ausente, divide arcos a cada 12 e usa cinco nomes fixos de arcos. Busca de referências encontrou apenas sua declaração; **não afirmar que esse componente aparece hoje**. Retirar ou reconstruir pelo contrato antes de qualquer reutilização.
- `Components/OrbitalFranchiseMap.tsx` já recebe grupos por payload; não foi encontrado import ativo. Não contar como recurso entregue.
- Entradas `addons/mal-sync/episodePage.tsx` e `addons/player-pro/episodePage.tsx` contêm telas placeholder. O manifesto de mal-sync aponta a entrada; a execução depende do carregador. Precisam ser classificadas pelo fluxo de instalação, sem presumir que estejam montadas.
- `resources/views/welcome.blade.php` contém o template Laravel e valores próprios. A rota raiz usa Inertia Lobby; não foi encontrada rota para welcome na leitura atual. Não incluir suas cores na contagem de defeitos visíveis do Lobby.

## Resultado da etapa estática

- Inventário inicial: 156 arquivos, incluindo 106 arquivos frontend (103 módulos e 3 manifestos). A dependência direta source-contracts foi incluída depois, totalizando 157 arquivos.
- Grafo de imports literais: 95 arquivos frontend alcançados pelas entradas atuais; 11 exigem classificação de carga dinâmica/não uso. O grafo não transforma automaticamente um arquivo não alcançado em arquivo morto.
- Candidatos lexicais fora das definições centrais: 262 linhas com cores literais; 238 com classes de paleta; 36 com atributos UI literais; 62 com possíveis textos JSX; 14 com possíveis fallbacks de identidade. As categorias podem se sobrepor e incluem falsos positivos documentados.
- Build Vite executado com sucesso nesta etapa: 2611 módulos; avisos de chunks grandes e import dinâmico ineficaz de telemetryXpLoop. Build não prova conformidade com a diretriz.
- Inventário por arquivo: `whitecontent-inventory-2026-10-25.md`. Hashes, trechos e linhas completos no JSON privado. A revisão manual dos estados e o teste de temas/idiomas no navegador ainda não estão encerrados.

## Matriz de contextos para encerramento

| Contexto | O que a revisão deve comprovar |
|---|---|
| Início | Três EP IDs elegíveis pelo instante atual; hidratação por relações; atualização por relógio. |
| Explorar | Índice local e filtros imediatos; cards genéricos por work_id; nenhuma lista particular de obras. |
| Calendário | Status em lançamento, data/dia e fuso consistentes; card por work_id; sem horário inventado. O filtro RELEASING e a exigência de grade UTC já existem no feed, mas precisam de validação integrada. |
| Universo | universe_id próprio e membros explícitos; agrupamento e seleção não dependem de títulos/MAL. |
| Obra | work_id; imagens, traduções, formatos e capacidades vêm do payload. |
| Temporada | season_id existente; relação com obra e EPs explícita, nunca quantidade de arcos. |
| Arco | arc_id existente e intervalos/vínculos comprovados; índice visual não vira ID. |
| Episódio | episode_id, obra, temporada, data e arco relacionados; próximo/anterior percorrem EPs existentes. |
| Player | Identidade da sessão por IDs próprios; dados de mídia vêm do Service; todos os menus/estados localizados e tematizados. |
| Discussão | Texto de interface por chave; conteúdo do usuário preservado; entidade/parent comment consistentes. |
| Perfil e biblioteca | Conta e entidades por ID; favoritos/histórico/progresso consultados sem duplicar aliases. |
| Gamificação | Apenas entidades e relações existentes; completude com evidência; sem temporadas, obras ou universos deduzidos de contagens/títulos. |
| Addons | Manifests são dados por addon_id; credenciais e URLs não são rótulos de interface; estados e controles usam strings/tokens. |
| Preferências/tema/idioma | Mesmas chaves em todos os temas/idiomas; alteração global sem editar telas; estados de ausência/falha também cobertos. |
| Visitante, membro, Plus e admin | Um mesmo componente recebe capacidades reais da conta; nenhum conteúdo fictício para simular acesso. |

## Sequência fixa para corrigir o que a revisão confirmar

1. Fechar inventário, alcance dos imports e evidências de cada contexto; manter este registro de pendências.
2. Consolidar os contratos de entidade, strings, tokens e capacidades existentes, preservando IDs e design.
3. Retirar regras por nome/índice e usar o grafo único nos consumidores.
4. Corrigir início, explorar e calendário exatamente pelos critérios aprovados, sem regras alternativas de fallback.
5. Centralizar os textos e valores de apresentação de todos os contextos, incluindo player/addons/perfil e acessibilidade.
6. Retirar ou adequar os protótipos e caminhos antigos, depois de verificar que não são dependências dinâmicas.
7. Validar fonte principal, bundle servido e uso real no navegador, com temas/idiomas distintos e relógio controlado para lançamentos.

Esta ordem não autoriza redesenho, outro serviço, regras por anime ou alteração dos critérios. Um problema novo entra como evidência no contexto correspondente, não muda a arquitetura acordada.

## Critério de conclusão da revisão

### Atualização da implementação — contratos e ativação

- WC01–04: implementado `CatalogEpisodeFeed`, consultando IDs próprios de episódios com instante conhecido até agora, sem restringir a obras em lançamento nem inventar episódios por contagem. A homepage aceita episódios diferentes da mesma obra, remove o fallback por obras e atualiza por relógio, foco e geração. A navegação do destaque aponta ao ID do episódio. Testes de feed, busca, relógio e contrato passaram; a validação integrada com a publicação SQL continua pendente.
- WC21: perfil e badge consomem o tier entregue pelo servidor; removida a inferência de admin por e-mail nesses consumidores. A política administrativa do servidor permanece.
- WC22: conquistas possuem IDs estáveis em `resources/data/achievement-catalog.json`, com rótulos nos seis idiomas e critérios explícitos. API valida elegibilidade; rótulos antigos são normalizados somente na entrada. XP e nível são derivados de uma política compartilhada, sem aceitar nível declarado pelo cliente. Testes de permissões, ações canônicas e troca de idioma passaram. Ainda é necessário exercício autenticado no navegador.
- O destaque cinematográfico usa tokens para status e sobreposição de capa, chaves para os controles e remove cálculos de links oficiais que não eram usados pela renderização. Isto não encerra WC11/12 nos outros componentes.
- Ativação principal concluída com backup: 723.668 entidades, 345.911 obras, 74.029 episódios, 1.899 temporadas, três arcos e 301.826 universos. Contas verificadas após a ativação: admin tier 3 e conta de testes tier 2 preservadas. A checagem adicional de chaves estrangeiras e a reprojeção/publicação estão em execução; ativar o grafo não comprova o consumo integral pelo site.
- A reprojeção aceita a publicação anterior verificada como entrada e a concilia contra a autoridade SQL, preservando UUIDs e rejeitando conflitos. A publicação anterior contém uma novel a mais; testes cobrem sua associação conservadora sem perda ou duplicação. Não considerar a promoção concluída antes do recibo de auditoria e troca do manifesto.
- Build Docker passou, 2.616 módulos: `app-C5fapB5I.js`, `app-CfWTzHOO.css`. O Node nativo Windows não tem o binding opcional de Rolldown; nenhuma dependência foi reinstalada para contornar isso.
- O endpoint real local retornou três episódios com IDs distintos, relação com work_id e instante UTC, além de `next_release_at`. A homepage no navegador exibiu os mesmos três destaques e o tooltip do episódio. O clique abriu Ao Ashi Season 2, episódio 4, com data local e navegação entre episódios. Ainda há rótulos fixos e título de aba duplicando Anirium nesse contexto. A aba temporária foi fechada, preservando a aba pública. Esta evidência não valida a precisão dos horários fornecidos pelas fontes nem toda a navegação; não confundir dados presentes com dados corretos.

Os achados acima descrevem avanços e seus limites; os demais WC continuam abertos. Não representam uma declaração de conformidade integral.

Não basta build verde ou ausência de matches em grep. É necessário comprovar, contexto por contexto, que os dados são resolvidos por IDs, as relações não são fabricadas, todos os textos de interface usam chaves e todos os valores de tema são fornecidos pelo registro. A tela precisa refletir a alteração de um payload, um idioma ou um tema sem edição de código específico.

Neste estágio há violações confirmadas. **Não é possível garantir que todo o site já siga o contrato.**
