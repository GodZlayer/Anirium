# Tier2: conta, Service e Stremio — 23/10/2026

Solicitacao: promover a conta conectada para tier2 e testar Service + addons.
Conta id5: tier1 -> tier2, verificacao posterior no banco confirmou2. A interface
apos reload mostrou ANIRIUM+ PRO; player-pro oficial habilitado por padrao.

Instalados pela interface e confirmados habilitados na conta:

- OpenSubtitles v3: https://opensubtitles-v3.strem.io/manifest.json
- Torrentio: https://torrentio.strem.fun/manifest.json
- AniScraper: https://c5541ffce7d3-aniscraper.baby-beamup.club/manifest.json

Os tres manifestos responderam com identidade e recursos Stremio. O repositorio
oficial do AniScraper declara suporte Nyaa e AnimeTosho. Amatsu tambem existe,
mas seu repositorio esta arquivado; nao foi instalado.

Nenhum listener4004 estava ativo. Executavel local do projeto iniciado oculto,
modo headless, dados privados em storage/app/catalog/probes/tier-two/service-data.
PID13176 observado ativo, escuta127.0.0.1:4004, health online/native/version2.2.0.
Health com Origin https://anirium.com.br respondeu CORS para esse dominio;
navegacao direta no IAB para http://127.0.0.1:4004/health tambem respondeu.

Testes:

- Laravel ServiceSessionIntegrationTest:3pass/15assertions. Cobre guest negado,
  tier1 negado e admin autorizado; nao substitui teste real da conta tier2.
- Go TestServiceEndToEndAuthorizedPeerPlayback:pass,9.223s, count1. Usa Core e
  provedor fixture e midia sintetica com implementacoes reais de preparacao,
  torrent e HLS. Nao comprova resolucao dos tres addons externos na conta real.
- Interface real: player-pro carregou, mas detector mostrou Service offline
  apesar do health positivo. A autorizacao/preparacao via player nao foi provada.

Resultado: tier2 e referencias de addons configurados; integracao completa
REPROVADA nesta execucao. Nao houve prova de playback ou legendas reais.
Nao se atribui causa conclusiva ao navegador/CORS sem evidencia adicional.
Evidencia: storage/app/catalog/probes/tier-two/player-service-offline.png.
Service permanece aberto e conta permanece tier2, conforme solicitado.

## Reteste com janela nativa aberta

Usuario exigiu testar o executavel com janela normal, e nao headless. Processo
headless iniciado nesta sessao foi encerrado; mesmo exe iniciado sem argumentos,
janela visivel. PID32324, titulo Anirium Player Pro / Servico de video-torrent,
MainWindowHandle263798, Responding=true. Log de inicializacao confirmou Window
shown and brought to foreground; listener4004 pertence ao mesmo PID.

Sessao web estava expirada; renovada escolhendo a mesma conta Google ja
autenticada. Interface voltou ANIRIUM+ PRO. Ao iniciar player, desta vez mostrou
Anirium+ Service Conectado, seguido de Falha ao preparar a reproducao. Portanto
conexao com exe normal passou; preparacao/playback externo continua sem prova.
Preflight OPTIONS /playback/prepare respondeu204 com Origin/Content-Type/POST
permitidos. Console registrou somente aviso generico de falha ao preparar;
causa exata ainda nao identificada. Nao atribuir conclusivamente aos addons.

Evidencias: native-window-retest.json e native-window-connected.png no diretorio
privado probes/tier-two. Executavel normal permanece aberto.

## Correcao da integracao — em verificacao de reproducao

Causa1 reproduzida: exe de16/10 rejeitava campos malId/episodeCount/format
enviados pelo player atual, retornando400 texto. O binario compilado da fonte
atual aceita o mesmo payload e retorna401 JSON para credencial propositalmente
invalida, em vez de rejeitar o contrato.

Causa2: busca de fontes executava somente magnet.search nativo; manifestos SDK
stream eram tratados como unsupported. Novo stremio_streams.go reconhece tipos
e prefixos de recursos e consulta stream/type/id.json dentro do caminho de
configuracao instalado. Aceita infoHash validado, preserva fileIdx e trackers;
recursos nao concedem capacidades nativas. Esta implementacao nao adiciona
suporte generico a todos os tipos de URL/debrid/arquivos do SDK.

Causa3: Torrentio retornava403 ao agente Go padrao. Transporte dos provedores
agora identifica honestamente AniriumIntegration/2.3, mantendo TLS, guardas de
rede e bloqueio de redirects. Probe publico apos a correcao recebeu50fontes de
Torrentio e2deAniScraper para MAL21881/ep1. Nenhuma midia e baixada nesse probe.

Identidade: fallback do player preserva mal_id; mapeamento MAL->Kitsu exige MAL
identico e episodio explicitamente publicado por AniZip. Legendas usam temporada
e numero publicados, confirmados no Cinemeta. SAOII ep1 foi identificado como
tt2250192:2:1 e OpenSubtitles retornou12candidatas no teste publico opt-in.

Autorizacao: transporte do Core usa HTTP1 explicito por padrao (incluindo ALPN
e http.Protocols), prazo15s, TLS validado e redirects recusados. Isso evita os
timeouts/erros observados em conexao HTTP2 pelo tunnel sem pular revalidacao.

Inicializacao: descoberta de metadados tem orcamento45s e inventario de faixas90s,
independentes do numero de alternativas. So fontes realmente examinadas entram
na selecao congelada. Cancelamento/geracao obsoleta nao publica resultados.

Regressoes Go focadas passaram, incluindo transporte, recursos, isolamento de
conta, identidade, indice de arquivo, selecao de episodio e E2E com midia sintetica
e transferencia real entre peers. Build Laravel/Vite passou: app-CvbCjbsy.js,
PlayerProComponent-Dh6p0aGg.js. Nao equivale a aprovacao de todo o playback real.

Exe canonico local atualizado com backup privado da versao anterior; download
publico/instalador nao foi publicado. Fonte em Animeflix/anirium-service, cliente
em Anirium-App. Runtime atual observado PID3108 com janela normal aberta.
Pela conta real, log registrou52fontes e os3manifestos com statusok. UI passou
para preparacao; leitura real dos arquivos e descoberta720p/1080p/eng/jpn/rus
foram observadas antes de limitar a descoberta. Prova final de video segue pendente.

### Prova de decodificacao e continuidade

stremio-playback-proof.json registrou video real com readyState4, pausedfalse,
currentTime6.616 e sem erro, na primeira janela24s de SAOII. Pausa e retomada
foram conferidas pela UI e pelo elemento de video. O player exibiu1080p/jpn,
duracao total23:42 e progrediu ate1:36. Isso comprova inicio, nao reproducao
completa: houve espera/falha no trecho seguinte e legenda portuguesa pendente.

Log revelou novo timeout de Core na vigilancia, cancelando os workers. Cada
leitura de midia fazia uma validacao remota independente. core_authorization_flight
agora une somente chamadas simultaneas para o mesmo token/dispositivo com
singleflight, sem TTL nem cache de autorizacao. Teste16chamadas confirmou1consulta
concorrente e nova negativa403 na consulta seguinte. HTTP1 usa conexao nova para
evitar reutilizacao travada no tunnel. TLS e revalidacao nao foram removidos.

Regressoes focadas passaram apos essas alteracoes (incluindo negacoes/autorizacao
e E2E). Runtime mais recente PID24660; reteste de continuidade em andamento.

### Resultado do reteste final

Exe final PID24660 reproduziu imagem real do episodio (captura
stremio-playback-fixed.png inspecionada), iniciou contagem e avancou por varias
janelas ate1:12 na observacao. A sessao permaneceu Anirium+ e nao foram vistos
novos timeouts de autorizacao nesse runtime. O menu de audio ofereceu rus nessa
selecao final; o teste anterior ofereceu jpn/eng/rus. Nao prometer idiomas ausentes.

Falha original de integracao corrigida e inicio/pausa/retomada comprovados.
Ha espera de buffer entre janelas; legenda portuguesa nao foi confirmada em
exibicao. Esses pontos permanecem limites da validacao, nao aprovar playback
perfeito ou todos os addons/formatos. stremio-fix-acceptance.json registra o
resultado e as limitacoes. Conta e Service normal permanecem abertos.

### Falha recorrente de carregamento — investigação de 23/10, 14h UTC

O início registrado acima não comprovou reprodução sustentada. O usuário reportou
novo travamento; os logs confirmaram timeouts repetidos de autorização às
13:58, 14:02 e 14:04, seguidos do cancelamento dos leitores de mídia.
Mesmo um token inválido levava cerca de 7,6 s para ser rejeitado tanto em
localhost quanto no domínio público. Medição temporária do bootstrap mostrou
custo de carregamento do Laravel, não falha na consulta aos 52 streams.

A rota de validação por Bearer foi retirada do grupo web: não inicia sessão,
cookies ou compartilhamento Inertia. Emissão/renovação no navegador continuam
no grupo web. O segredo passa por config/services.php para suportar config:cache.
Teste novo usa tier 2, configuração de segredo, ausência de cookies e mudança
posterior para tier 1; a mesma assinatura passa a receber 403. Bateria:
ServiceSessionIntegrationTest, 4 testes / 20 asserções, aprovada.

Caches de configuração e rotas foram gerados. O startup do container agora
os reconstrói antes do PHP-FPM. OPcache continua verificando alterações, com
intervalo de 60 s para reduzir stat de dependências no bind mount Windows.
Recarregar PHP-FPM ao implantar código que precise valer imediatamente.
Depois de alterar configuração ou rotas no container em execução, executar:

```powershell
& 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' exec anirium_app php artisan config:cache
& 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' exec anirium_app php artisan route:cache
```

Não ler nem publicar bootstrap/cache/config.php: contém configuração privada.
Para testes com RefreshDatabase, não reutilizar configuração de produção
cacheada: apontar APP_CONFIG_CACHE e APP_ROUTES_CACHE para caminhos exclusivos
de teste inexistentes, ou limpar caches antes e reconstruí-los depois.

Também foi removida a dependência de identidade do objeto anime na preparação:
objetos novos com os mesmos dados de episódio não devem refazer /playback/prepare.
O efeito de contexto depende do ID da conta, evitando reset por atualização
apenas do objeto de perfil. Build e reteste sustentado ainda em andamento.

A investigação também confirmou falha na continuação: onEnded chamava
/playback/session com action=seek, cujo contrato cancela as janelas atuais e
prefetch. Assim descartava o trabalho do próximo trecho. Agora a continuação
natural usa POST /playback/window e promove o prefetch existente; seek manual,
qualidade e seleção de áudio mantêm o contrato de seek. As respostas diferem:
window devolve a janela diretamente; session a envolve em {window}.
O teste de prefetch também reproduziu duração real 24,083333 s: o decoder
normalizava a próxima posição para 24 s, mas o Service comparava com 24,083333 s
usando tolerância 0,05 s e rejeitava o pré-buffer. A comparação agora aplica a
mesma normalização de 4 s do contrato de requisição. Teste aceita o sucessor
normalizado e rejeita pulo para 48 s; promoção preserva contextos atuais e novos.
Testes Go de janela/sessão e E2E autorizado: aprovados, 18,877 s.
A versão final preserva os limites exatos das janelas: a posição HTTP arredondada
é resolvida de volta ao sucessor já conhecido, sem descartar os 0,083333 s do
limite real. Prefetch, promoção e playlist contínua continuam contíguos. Testes
repetidos após esse ajuste: 10,968 s, aprovados. Build frontend final passou:
PlayerProComponent-Cq_hZzQ4.js / app-Blej4fFR.js / app-CjFZYcpD.css.

A varredura automática do Tailwind percorria também a base e artefatos privados:
o build anterior gastou 362,9 s na transformação CSS. O source agora é resources/
(relativo ao CSS), abrangendo JS e views. Build caiu para 15,47 s, CSS 81,91 KB.
Referência do contrato: https://tailwindcss.com/docs/detecting-classes-in-source-files.

Usuário confirmou reprodução funcional e algumas legendas funcionando;
outras aguardam ou falham. Isso é confirmação parcial, não aprovação de todas
as faixas. Service atualizado e aberto normalmente, PID40740; reteste final
no navegador iniciado às 18:24 UTC.
Reteste às 18:26–18:29: vídeo real readyState4, sem erro, avançou por janelas
0/24/48/72/96/120 s. Latências de promoção observadas: 2.097/226/185/20.520/591 ms.
Não houve nova busca de fontes nesse intervalo. Há buffer variável, não garantir
zero espera. A legenda escolhida continuou aguardando; não impediu o vídeo.

Pausa após uma troca de janela revelou target de seek ainda presente: o controle
só alterava a intenção e não pausava um decoder já ativo. O caminho de intenção
agora é usado somente durante requisição/seek/carregamento; com decoder pronto,
o botão controla video.play/pause e sincroniza a intenção. Build desse ajuste
passou em 22,24 s: PlayerProComponent-DsWEZYb0.js / app-DZq3EB3h.js.
Verificação final do build DsWEZYb0: pausa conservada por mais de 5 s inclusive
atravessando uma janela pronta; botão retomou decoder real (paused=false,
readyState=4). Avançar10s solicitou posição67,368166 e voltou a tocar após11,715s.
Prova final às18:34:36: posição1:29/23:42, readyState4, pausedfalse, semerro;
legenda ainda aguardando. Evidências playback-continuity-proof.json e
playback-continuity-fixed.png no diretório privado tier-two. Nenhuma alegação
de ausência de buffer ou de todas as legendas funcionando. Conta e exe permanecem
abertos. Download público/instalador não foi publicado.
