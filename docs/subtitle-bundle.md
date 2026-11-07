# Entrega antecipada de legendas — v1

O Service prepara legendas de texto da fonte real de vídeo em lotes de 60 s.
Uma execução FFmpeg lê a entrada compartilhada e produz todas as faixas ainda
não cacheadas. SRT, ASS/SSA, WebVTT, mov_text e text são admitidos pelo inventário;
legendas em imagem continuam excluídas. Silêncio é cobertura válida.

A janela de vídeo só fica pronta após os intervalos de legenda necessários
terminarem como prontos ou falhos. Falhas são explícitas por faixa/intervalo e
não mantêm o vídeo esperando indefinidamente. Há um worker embutido por sessão,
deadline de 90 s por lote e até oito trabalhos pendentes. Seek prioriza a região
de destino, preservando intervalos anteriores. Um intervalo à frente é preparado
antecipadamente. Faixas externas/sidecars são obtidas completas com até dois
workers e prazo de 90 s por trabalho, sem bloquear a janela do vídeo.

O cache do coordenador tem orçamento de 64 MiB de conteúdo aceito; o cache VTT
compartilhado anterior mantém seu próprio limite de 16 MiB. Exceder orçamento
produz falha explícita. Os workers pertencem à sessão, são cancelados na revogação
e aguardados durante sua retirada. Saídas incompletas não são publicadas.

## Contrato HTTP

O manifesto anuncia `subtitleBundleVersion: 1`. `GET /playback/subtitles`
requer o mesmo playbackTicket das rotas de mídia; aceita `epoch` e `since`
inteiros não negativos. Resposta JSON:

- `version`, `epoch`, `revision`, `source`, `reset`, `tracks`.
- `source` é um identificador opaco, sem magnet, URL ou caminho local.
- Cada faixa contém id, language, title, status, alignment, embedded, complete
  e parts. Cada parte contém start/end absolutos, cues e indicação de falha.
- Cada cue contém start/end absolutos e text. Intervalos vazios contam como
  preparados; a última fala não define a cobertura.
- Após a primeira carga, apenas faixas/partes alteradas são enviadas. O cliente
  mescla partes por início. Mudança de epoch exige substituir os dados anteriores.
- Cada janela informa subtitleSource; faixas embutidas de outra fonte não são
  exibidas. Externas permanecem com alinhamento não verificado; não há ajuste
  automático presumido entre releases diferentes.

`/subtitles` permanece compatível: lê o coordenador quando a fonte já foi
estabelecida. Um pedido legado completo pode solicitar a conclusão sequencial
dos lotes, compartilhando o mesmo cache. Clientes antigos que só usam variante
integral e nunca definem uma janela mantêm o caminho legado anterior.

## Player

useSubtitleBundle recebe deltas independentemente da seleção, em polling de 1 s.
Trocar idioma/opção consulta somente as falas em memória; a seleção não compõe
as dependências de transporte nem a seleção enviada ao buffer do Service.
Faixas embutidas ficam primeiro nas alternativas; uma escolha explícita é
preservada pelo ID, não pela posição mutável na lista. O controle de buffer usa
cobertura conjunta das faixas embutidas, inclusive silêncio e falhas terminais;
legenda externa lenta não bloqueia o vídeo. O estado aguardando é mantido quando
faltam dados reais. A entrega inicial pode esperar preparação; a troca entre
faixas já entregues é local.

## Verificação

Dez testes novos Go cobrem batch SRT/ASS real, silêncio, cache, deadline,
falha parcial, fonte substituída, prioridade de seek, endpoint protegido,
compatibilidade e limite de downloads. Cinco testes Node verificam seleção local,
deltas, relógio, silêncio, fonte trocada e falhas. A regressão E2E transfere mídia
entre peers e exige as faixas prontas junto da janela publicada. Regressões Go
focadas passaram em 13,207 s. Build Vite passou com 2.603 módulos.
O detector Go de data races não foi executado: CGO está desativado e GCC não está
instalado neste ambiente. Não foram instaladas dependências adicionais.

Executável local atualizado; instalador público não publicado. A cópia anterior
foi preservada em storage/app/catalog/probes/tier-two/anirium-service-before-subtitle-bundle.exe.
No navegador autenticado, cinco faixas da fonte real ficaram prontas juntas;
trocas entre alternativas alteraram a fala em memória, mantendo tempo e pausa.

### Proteção das janelas anteriores durante fallback

O teste real inicial preparou cinco faixas juntas (0–60 e 60–120 s), mas a
ordenação dinâmica de capacidade trocou o produtor do próximo trecho. Isso
invalidava cedo demais o inventário da janela ainda em reprodução. Agora o
produtor já usado fica primeiro para a mesma qualidade, enquanto elegível;
falhas continuam permitindo fallback. Coordenador e player guardam os inventários
das duas fontes anteriores, consultados somente pela identidade da janela que
os possui. O inventário anterior não é apresentado como pertencente à fonte nova.
Dois testes específicos cobrem fonte estável e cobertura antiga ainda disponível
à janela antiga sem ser emprestada à nova. Regressões finais Go: 18,030 s,
aprovadas; cinco testes Node aprovados. Build final D-5fskEC / app-YRZaeyTq.

A extração também limita a duração de leitura na entrada FFmpeg (`-t 60` antes
 de `-i`), além dos limites de saída. Isso evita que faixas esparsas obriguem a
leitura até uma legenda muito distante apenas para encerrar o intervalo.
Referência: https://www.ffmpeg.org/ffmpeg.html (opção -t input/output).

O primeiro quadro aguarda os dados do lote também no navegador, fechando a
corrida entre a janela pronta e o polling de legendas. Alternativas embutidas
ficam primeiro; seleções explícitas são preservadas pelo ID da faixa.

### Correções encontradas na validação visual

A legenda tinha z-index 35, acima dos controles (30). O overlay agora usa 20;
menus permanecem acima e foram conferidos com legenda visível. Evidência local:
`storage/app/catalog/probes/tier-two/subtitle-menu-layer-fixed.png`.

A fonte escolhida oferece cinco faixas embutidas, todas eng. A ausência de
externas tinha outra causa: o catálogo fornece `episodes_count`, enquanto o
adaptador do player lia somente `episodes`, enviando contagem zero ao Service.
O adaptador agora aceita o campo real do catálogo. O log confirmou antes
`mal=21881 episode=1 count=0 resolved=false`. A consulta pública com a contagem
correta resolveu `tt2250192:2:1` e retornou 12 candidatas OpenSubtitles.
O teste público opt-in também cobre resolução a partir do contexto MAL original.

Build frontend após essas correções: PlayerProComponent-B4AC7T1b / app-2Dt_nM97;
cinco testes Node aprovados. Binário local com diagnóstico sem credenciais:
SHA256 522D6EF9594736A417105852231851DD8A0482B176645ADDCD472CA60AEBAF09.

Reteste real final: log `mal=21881 episode=1 count=24 resolved=true`, seguido
de `candidates=12 timeout=false`. O navegador recebeu as 12 externas; revisão
24 registrou 12 prontas e zero falhas. O menu apresentou português (`por`),
espanhol, alemão e outros idiomas enquanto o vídeo ainda era preparado.
Evidência: `storage/app/catalog/probes/tier-two/subtitle-languages-fixed.png`.
Não foi presumida sincronização entre essas legendas externas e a release do
vídeo: continuam identificadas como não verificadas, com ajuste manual.
