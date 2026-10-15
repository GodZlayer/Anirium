# Revisão de fronteiras de mídia — BOUNDARY-REVIEW-20261004

Data: 2026-10-04. Escopo: separação técnica Core oficial/catálogo/autenticação, Player apenas cliente de manifesto/service, Service como único motor torrent, providers externos independentes autorizados por addon/conta.

Método: leitura do código atual + execução dos dois verificadores contratados. Sem garantia jurídica nem equivalência legal a Stremio. Sem deploy, release ou transmissão de credenciais. Nenhuma fonte frontend/service foi editada nesta revisão.

## Verificadores contratados (executados nesta sessão)

| Verificador | Comando | Resultado observado |
| --- | --- | --- |
| Fronteiras de mídia | `node scripts/verify-media-boundaries.mjs` | PASSOU (exit 0): "Core and Player media boundaries verified." |
| Fontes oficiais | `node scripts/verify-official-sources.mjs` | PASSOU (exit 0): "Official source destinations verified: spoofed, unsafe and unknown links rejected." |

## Achados comprovados (com evidência)

### 1. Core oficial: catálogo, contas e autorização — não agrega mídia
- Core é app Next.js 16.3.6 / React 19.2.8 (`package.json`) com PostgreSQL 16 canônico (`docker-compose.yml`, serviço `anirium-db`, `anirium_canonical`).
- `scripts/verify-media-boundaries.mjs` varre todo `src/**/*.{ts,tsx,json}` e rejeita `NyaaP2PProvider|AniriumSourceProvider|nyaa|1337x|thepiratebay|tpb|aggregateSources|torrent-stream|webtorrent|magnetUri|magnet:?|…tracker…`; também rejeita dependências P2P em `package.json`/`package-lock.json`. PASSOU.
- Gateway de addons removido: `src/app/api/addons/[...slug]/route.ts` retorna `410 addon_gateway_removed` (`Cache-Control: no-store`) para GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS. Comentário: "A UI manifest does not grant server-side network execution."
- `src/lib/officialSources.ts` (`filterOfficialStreamingLinks`) aceita apenas destinos https dos distribuidores whitelist (crunchyroll, netflix, hulu, primevideo, disneyplus, hidive, tubi, pluto), rejeitando userinfo, porta, `/search`, `?q=`, tipos INFO/SOCIAL e domínios desconhecidos (fail closed). Verificador passou rejeitando links falsificados/unsafe/desconhecidos.
- Guarda de gateway (`scripts/verify-addon-gateway.mjs`, não executado nesta sessão) existe para provar 410 sem chamadas de rede, acesso a registry ou repasse de credenciais.

### 2. Player Pro: apenas cliente de manifesto/service
- Manifesto `src/addons/player-pro/manifest.json` declara capabilities `ui.player.render`, `ui.player.overlay`, `playback.client`, `subtitles.manage`, `audio.manage`; **não** declara `provider.server`, `playback.source.provide` nem `playback.engine.orchestrate`. O guarda rejeita explicitamente essas capabilities.
- Cópia distribuída `community-plugins/player-pro/manifest.json` é byte-identical à de `src` (guarda compara e PASSOU).
- `src/addons/player-pro/PlayerProComponent.tsx` usa `serviceEndpoint = http://localhost:4004` e chama `POST /playback/prepare`; não contém `/api/sources` nem `/stream?` (guarda varre `.tsx` do player e PASSOU). Únicas ocorrências de "torrent"/"magnet" são rótulos de UI (`data.engine === "anirium-native-torrent"`, comentário "Multi-Magnet"), não transporte.
- `package.json` do Core não tem `torrent-stream`/`webtorrent`/`bittorrent-*`; `package-lock.json` sem dependências P2P transitivas (guarda PASSOU).

### 3. Service local: único motor torrent
- `anirium-service` é módulo Go 1.27 (`go.mod`) com `github.com/anacrolix/torrent v1.61.0` — o único motor torrent do sistema.
- Escuta apenas loopback: `local_listener.go` `listenLocalPlayerHTTP` faz `net.Listen("tcp4", "127.0.0.1:porta")`; `main.go` define `canonicalPort = 4004`. Comentário: "The Player API is local IPC, not a LAN media server."
- Autorização via Core: `main.go` `validateServiceToken` faz GET `{core}/api/service/session/validate` com `Authorization: Bearer <token>` + `X-Anirium-Device`, timeout 8s, cliente sem redirecionamento, corpo ≤1 MiB, decode JSON estrito único (rejeita lixo anexado), exigindo `status=="authorized" && level>=2 && AccountID != ""`.
- Token Core: `src/lib/serviceAuth.ts` HMAC-SHA256, TTL 5 min, base64url; `verifyServiceToken` rejeita device divergente, assinatura inválida (`timingSafeEqual`), expirado, `level<2`, `playerSessionId` ausente/malformado, token >8192 bytes. (Guarda `scripts/verify-service-tokens.mjs` existe; não executado nesta sessão.)
- Configuração de provider vem somente da validação autenticada do Core, nunca do request do Player: `account_providers.go` `accountProviderServers(auth)` itera `auth.InstalledAddons`, mantém só os em `auth.AuthorizedAddonIDs`, exige `config.ID == addon.ID` e capability `provider.server`/`magnet.search`/busca de legenda, e URL manifest http/https sem userinfo/fragmento.
- Rotas locais do Service (`main.go`): `/playback/prepare`, `/playback/window`, `/playback/renew`, `/playback/variant`, `/providers`, `/stats`, `/manifest`, `/hls/`, `/subtitles`, `/health`.
- Busca a provider: `main.go` `searchProviderServersSubset` busca o manifesto (8s), exige `magnet.search`, `manifest.ID == server.ID`, endpoint de busca resolvido no mesmo scheme+host sem userinfo; depois GET `/search` com title/titleEnglish/titleRomaji/season/ep (20s), decode ≤4 MiB, aceita só resultados com `normalizedMagnetHash` válido.

### 4. Providers externos: processos independentes, autorizados por addon/conta
- Nyaa (`community-plugins/nyaa-p2p-addon`) é servidor Node separado na porta 4001 (`server.js` `PORT || 4001`), container Docker próprio `anirium-addon-nyaa-p2p` na rede `anirium_network`, `enabled:false` por padrão (`manifest.json`).
- Capabilities do Nyaa: apenas `["magnet.search"]`; descrição explícita "Não processa mídia nem fornece streaming"; endpoints `/manifest`, `/search`, `/health`.
- Outros addons comunitários são containers desacoplados próprios: local-library :4002, youtube-trailers :4003, mal-sync :4005, watch-party :4006 (`docker-compose.yml`). O Player Pro saiu do Compose para não colidir com a porta 4004.
- `accountProviderServers` só habilita providers instalados **e** autorizados pela conta (`AuthorizedAddonIDs`), com config criptografada por conta (`docs/COMMUNITY-MANIFEST-BOUNDARY.md`: limite de 50 addons/conta, config criptografada, isolamento entre contas, orçamento de escrita).

## Estado de execução observado agora (2026-10-04, live)
- Porta 4001 LISTENING, dono `com.docker.backend.exe` (PID 12792) — porta do container provider Nyaa publicada pelo Docker; também `wslrelay` (PID 14464) em `[::1]:4001`.
- Porta 4004 LISTENING, dono `anirium-service (3).exe` (PID 468872, `C:\Users\santo\Downloads\anirium-service (3).exe`) — o Service local Go, com conexão loopback ESTABLISHED `127.0.0.1:64584 ↔ 4004` (cliente PID 443228).
- Correção de proveniência: a memória do projeto (snapshot 2026-10-03) registrou "nenhum listener4004". A observação ao vivo desta sessão mostra o Service ativo em 4004 e o provider em 4001. A memória é evidência datada, não verdade atual.

## Pendências / não validado
- Independência jurídica: Nyaa permanece no mesmo repositório e Compose, usa infra/domínio do projeto e declara autoria "Anirium Open Community". Separação de processo/contrato não estabelece terceiro juridicamente independente (`docs/COMPONENT-RESPONSIBILITIES.md`). Identidade de operador, controle de domínio/deploy, manutenção, hospedagem, direitos e canais de atendimento precisam de evidência própria.
- Nenhuma certificação jurídica concluída; sem equivalência a Stremio. Termos/protocolo Stremio são apenas orientação, não decisão judicial nem licença de conteúdo.
- Sem prova de que algum catálogo externo tenha direitos autorizados; Nyaa é implementação de teste, não prova de licitude de cada resultado.
- Sem migração de produção, sem deploy/release, sem aceitação de playback autenticado no navegador/Service instalado, sem auditoria de CDN/SSRF/DDoS de produção.
- Verificadores do guarda mais amplo (`verify-addon-gateway`, `verify-service-tokens`, `verify-player-loader`, `verify-service-leases`, etc.) existem mas **não foram executados nesta sessão**; apenas os dois contratados foram observados.
- Go suite, typecheck, build, race e E2E não foram executados nesta sessão.

## Nota de encerramento
Fronteiras técnicas observadas estão no lugar e os dois verificadores contratados passaram. Isto é evidência de separação de código/processo/contrato, não de independência operacional/jurídica, licenciamento de conteúdo ou aceitação de lançamento.
