# Verificação do Service — 2026-10-04

Escopo: apenas Service. O usuário autorizou execução direta nesta conversa, sem delegação. Nenhum executável ativo foi substituído e nenhum site/addon foi publicado.

## Correção aplicada

- Parser WebVTT aceita falas com ou sem identificador, preserva texto multilinha, identificadores, configurações e blocos NOTE/STYLE/REGION.
- Janela filtra e recorta falas em [posição, posição + 60 s), convertendo timestamps absolutos para relativos uma única vez. A extração completa não altera o relógio.
- FFmpeg preserva timestamps absolutos com `-copyts`; o término da janela usa `-to posição+60`, mantendo seek de entrada para a leitura progressiva.
- Removido wrapper redundante que podia aplicar o offset duas vezes.

## Evidência observada

`go test -run 'TestSyntheticMediaPipelineSequentialHTTP|Subtitle|WebVTT' -timeout 180s`: PASS, 9.281 s.

`go test ./... -timeout 180s`: PASS, 46.161 s (suíte completa após a correção).

O teste integrado gera mídia sintética local e usa validação de sessão simulada. Verifica manifesto, bloqueio sem sessão, entrega HTTP de legendas, decodificação de vídeo/áudio HLS e reprodução da janela após seek. Testes de extração cobrem português e inglês; os testes do parser cobrem falas sem identificador, sobreposição e limite da janela.

A fixture foi corrigida para autorizar somente a origem loopback exata de seu servidor de legendas. A expectativa do áudio foi corrigida para a frequência realmente gerada (400 Hz), ignorando transientes de codec na janela posterior. A proteção de rede de produção não foi relaxada.

## Transporte torrent controlado

O helper de peers agora consulta um manifesto remoto de provider mínimo, rejeita o addon sem autorização, envia somente `q`, recebe e deduplica links e então obtém metadados/peças de um seeder real em loopback. A seleção de arquivos mantém somente o episódio solicitado.

`TestProgressivePeerSubtitleWindows` gera MKV sintético com português e inglês e passa pela entrada progressiva real: verifica janelas em 8 s e 60 s, timestamps relativos, exclusão da fala inicial e preservação da fala sobreposta ao início em 60 s. PASS junto dos testes de mix e transferência, 4.642 s.

Após adicionar esses testes: `go test ./... -timeout 180s` PASS, 41.025 s.

`TestRealVideoAndAudioPublishBeforeInputTailIsAvailable` passou: o teste bloqueia a cauda da entrada e decodifica segmentos já publicados antes de liberá-la. `TestPeerMediaProducesMixedVideoAudioAndSubtitleAlternatives` passou com peers reais locais, áudio por linguagem e alternativas de legendas. Esses testes são complementares; não representam um único cenário com atraso de peças de torrent durante uma sessão de navegador.

## Executável candidato

Build separado: `release/anirium-service-verified-20261004.exe`, 32.976.384 bytes, compilado com subsistema Windows GUI.

SHA-256: `9564E161459C837862714AD0633A9566B18B4B8871EB43EFD3BFF718F9D6E4D8`.

É um candidato local sem assinatura Authenticode (`NotSigned`), não uma versão certificada pela Microsoft. Não foi iniciado, publicado ou usado para substituir o processo ativo.

Atualização de empacotamento: o `.exe` isolado falhou em `--diagnostics` por falta de FFmpeg empacotado. Criado `release/verified-20261004/` com `anirium-service.exe`, ferramentas FFmpeg/FFprobe e LICENSE/MEDIA-NOTICE reutilizados do payload 2.3.15.0 existente. O executável desse pacote passou no diagnóstico: `bundledTools=true`, `mediaSmokeTest=true`, `networkStarted=false`, exit 0. Isso executa o candidato e seus codecs sem abrir GUI, iniciar torrents ou ler credenciais; não prova uma sessão de reprodução no binário. O processo ativo não foi substituído.

## Processos de mídia sem console

Todas as chamadas de produção a FFmpeg/FFprobe usam agora `mediaCommandContext`, com `HideWindow=true` e `CREATE_NO_WINDOW` no Windows. O contexto continua cancelando o processo. Teste de configuração/cancelamento + reprodução HTTP + legendas com peer local: PASS, 5.345 s. Uma busca no código de produção confirmou que `exec.CommandContext` existe somente dentro desse helper.

Suíte completa após essa migração: `go test ./... -timeout 180s` PASS, 53.674 s.

Recompilado `release/verified-20261004/anirium-service.exe` com essa correção. Diagnóstico real do novo binário: codecs empacotados e smoke test PASS, exit 0, sem iniciar rede. SHA-256 atualizado do binário empacotado: `D87F7B86FF5B9408AF2C5FEA11F4B087977EF7C5639103CF21BE5E2EE6EBBFC8`. O hash acima do `.exe` isolado anterior identifica outro build, não esse binário atualizado. Nenhum processo ativo foi substituído.

## Inicialização real do candidato

Na verificação seguinte não havia processo Service nem listener em 4004. Iniciado o candidato empacotado, PID 475796, na porta canônica; nenhum processo anterior foi encerrado. `/health` respondeu 200, a janela/tray inicializou segundo o log, e `/manifest` sem sessão respondeu 401. O mesmo PID permaneceu responsivo nas observações subsequentes. Nenhum reinício foi observado nesse intervalo curto; não se conclui que o problema histórico de reinícios foi resolvido. O candidato foi deixado ativo para teste local. `go vet ./...` também passou.

## Sessão integrada com autorização e peer inicialmente indisponível

`TestServiceEndToEndAuthorizedPeerPlayback` usa subprocesso de teste para isolar os globais do motor, sem tocar no Service ativo. Core e provider são servidores HTTP de fixture; a rota `/playback/prepare`, seleção de addon da conta, manifesto remoto, busca mínima, cliente torrent, entrada progressiva e processamento de mídia são os caminhos de produção.

Verificações: conta sem Plus recebe 401 antes de consultar provider; conta autorizada obtém ticket; resultados duplicados viram uma fonte; antes de existir peer nenhum segmento é anunciado como pronto; após introduzir o seeder loopback ocorre transferência real e o manifesto publica somente 480p, áudio japonês e duas legendas existentes. Vídeo e áudio da playlist são decodificados por FFmpeg. As legendas português/inglês da janela em 4 s conservam a fala aos 5 s como timestamp relativo de 1 s. O seek em 4 s gera e publica uma nova janela, com vídeo e áudio novamente decodificados.

Teste integrado PASS, 4.056 s. Três repetições consecutivas PASS, 10.217 s. Isso demonstra transição de nenhum peer para um peer disponível, não todas as condições possíveis de internet ou a sessão real de uma conta no site.

Suíte completa sem cache depois do novo teste: `go test ./... -count=1 -timeout 180s` PASS, 53.063 s.

## Queda e substituição de peer durante processamento

`TestProgressiveMediaSurvivesPeerReplacement` usa arquivo MP4 sintético de 6.594.437 bytes, cliente torrent real, seeder loopback limitado a 128 KiB/s, entrada seekable/range e publisher HLS incrementais de produção. Depois do primeiro segmento, confirmou que o arquivo ainda estava incompleto e encerrou o seeder. O segmento publicado continuou decodificável durante a ausência do peer; a playlist não foi falsamente finalizada. Um segundo seeder, com outra porta e o mesmo info hash, permitiu ao mesmo produtor continuar recebendo peças, concluir a playlist e decodificar o resultado completo.

PASS, 55.551 s. No momento da queda haviam sido obtidos 851.968 de 6.594.437 bytes. O cenário não depende de um arquivo previamente baixado por inteiro. Não representa ausência ilimitada de peers nem garante reprodução sem pausa se o buffer acabar.

Suíte completa sem cache com esse cenário incluído: `go test ./... -count=1 -timeout 180s` PASS, 106.686 s. `go vet ./...` PASS. O candidato ativo conservou PID 475796 e continuou responsivo, sem ser interrompido pelo teste.

## Etapas posteriores
## Reprodução no executável empacotado

Adicionado modo opcional `--headless --port=0 --data-dir=<caminho absoluto> --no-peer-discovery` para executar a API em porta/pasta isoladas, sem UI de desktop. Esse modo não remove autenticação nem altera o contrato de providers. `--no-peer-discovery` desativa DHT/PEX/trackers; não é um bloqueio de peers explícitos. Sem argumentos, os padrões de desktop/porta 4004/descoberta permanecem iguais. Testes rejeitam opções inválidas e pasta relativa.

Build separado `release/verified-runtime-20261004/anirium-service.exe`, versão de desenvolvimento `2.3.16-dev`, com as ferramentas e avisos de licença. SHA-256: `7E35CCD7C281EAB0E95456723A9940E6C81FB0537271B70E8A33FBCAACAC95B1`.

Teste integrado com `ANIRIUM_PACKAGED_SERVICE` apontando para esse arquivo executou o `.exe` real em porta efêmera e pasta privada. Usou proxy TCP de teste para segurar o peer antes da preparação e liberá-lo depois, sem injetar metadados/variantes no Service. Os mesmos checks de conta sem Plus, conta autorizada, provider remoto, dedup, manifesto, vídeo/áudio, legendas por/eng e seek passaram. A transferência foi comprovada pelos bytes enviados pelo seeder real ao processo. PASS, 4.023 s no build final (teste anterior do pacote: PASS, 11.519 s).

O processo isolado criado pelo teste foi encerrado pelo próprio teste; PID 475796 do candidato de desktop anterior permaneceu ativo. Não houve publicação, assinatura ou mudança em Core/site/Player/addon.

Suíte final sem cache: `go test ./... -count=1 -timeout 180s` PASS, 109.537 s. `go vet ./...` PASS.

## Auditoria de conclusão — Service isolado

| Requisito desta etapa | Evidência verificada |
| --- | --- |
| Service interpreta episódio/temporada; provider fornece contrato mínimo | Testes do adapter: aliases, temporada/episódio, batch, v2 de release, dedup e `.torrent`; E2E do processo real envia somente `q` |
| Autorizar conta/sessão/addon antes de consultar fontes | E2E do `.exe`: conta sem Plus recebe 401 sem busca; token/dispositivo/session e addon vêm da resposta Core de fixture |
| Obter metadados e peças por torrent | Seeder real loopback, bytes de transferência e seleção de arquivos do episódio verificados |
| Preparar mídia local antes do arquivo inteiro | Teste de cauda bloqueada + teste real de queda aos 851.968/6.594.437 bytes |
| Mix apenas com fontes compatíveis e qualidades existentes | Inspeção de source_set/video_sources e testes de timing, fallback, pesos, ausência de upscale e mídia de peers |
| Uma saída de áudio por linguagem e alternativas de legendas | Testes de inventário, budget/pool de áudio, alternativas da mesma língua e extração real português/inglês |
| Manifesto, HLS, áudio, legendas e seek consumíveis pelo cliente | FFmpeg decodifica saídas HTTP produzidas pelo `.exe`; WebVTT tem falas/timestamps esperados após seek |
| Falha de peer não inventa EOF e admite recuperação | Publisher permanece ativo, buffer decodifica sem peer, segundo seeder conclui a mesma playlist |
| Executável com codecs e sem console de subprocessos | Build GUI, diagnóstico real de ferramentas, helper CREATE_NO_WINDOW/HideWindow e testes; `.exe` real passa reprodução |
| Preservar fronteira operacional e memória | Sem mudanças em Core/site/Player/provider nesta etapa; registros de decisões e verificações no vault Obsidian |

A etapa de implementação e verificação do Service isolado está concluída. Isso não conclui a integração do site/conta real/Player nem a assinatura, certificação e publicação; essas etapas continuam separadas conforme o escopo solicitado pelo usuário.

## Integração e publicação futuras

- Teste manual de integração com a conta/site/Player reais (fora do escopo atual de Service isolado), antes de qualquer publicação.
- Monitorar situações de internet reais; os testes locais cobrem transição inicial de disponibilidade, queda/substituição durante processamento, mix, buffer e seek, sem garantir disponibilidade futura de peers.
- Assinatura/publicação são etapas separadas. O build novo de desenvolvimento já passou reprodução no processo real; a instância desktop ativa ainda é o candidato anterior, sem os flags de isolamento, e não foi substituída.

Não interpretar os testes controlados como garantia de disponibilidade de peers na internet, nem como certificação Microsoft ou conclusão do plano inteiro de Core/site/Player/addons.
