import fs from 'node:fs';
import path from 'node:path';
const directory=path.resolve('storage/app/catalog/probes/twenty-anime');
const catalog=JSON.parse(fs.readFileSync(path.join(directory,'catalog.json')));
const playback=JSON.parse(fs.readFileSync(path.join(directory,'playback.json')));
const byID=new Map(playback.results.map(item=>[item.id,item]));
const retryFile=path.join(directory,'playback-retry.json');
const retries=fs.existsSync(retryFile)?JSON.parse(fs.readFileSync(retryFile)).results:[];
const verificationFile=path.join(directory,'playback-verification.json');
if(fs.existsSync(verificationFile))retries.push(...JSON.parse(fs.readFileSync(verificationFile)).results);
const retryByID=new Map(retries.map(item=>[item.id,item]));
const currentFile=path.join(directory,'catalog-current.json');
const current=fs.existsSync(currentFile)?JSON.parse(fs.readFileSync(currentFile)):null;
const reviewFile=path.join(directory,'content-review.json');
const reviews=new Map((fs.existsSync(reviewFile)?JSON.parse(fs.readFileSync(reviewFile)).reviews:[]).map(item=>[item.id,item]));
const lines=['# Teste de 20 animes: lançamento e imagem','',`Geração observada: ${catalog.generation}.`,
...(current?['',`Mesma amostra reavaliada na geração ${current.generation}; as lacunas de grade e os episódios futuros destacados abaixo permanecem.`]:[]),
'','A checagem de catálogo usa as partições publicadas, documentos de episódios com checksum e as funções reais de seleção do frontend. A reprodução em lote usa o executável nativo aberto, autorização normal da conta de teste e decodificação FFmpeg de uma imagem do HLS entregue. Isso comprova imagem decodificável pelo Service; não equivale a assistir cada episódio inteiro no navegador.',
'','Cada tentativa tem orçamento de 240 segundos após a emissão da sessão, mais até 30 segundos para decodificação do quadro pronto. Um limite de tempo registra imagem não confirmada nessa rodada; não prova indisponibilidade permanente. Fontes e peers são externos e variam.',
'','A repetição preserva os resultados da primeira rodada e permite até 300 segundos para a janela, após a descoberta, com renovação normal da credencial. Em One Piece foram amostrados também 10 e 20 segundos para esclarecer a vinheta inicial.',
'','| Anime | Grupo | Grade | Último com data passada | Próximo futuro | Imagem |', '|---|---|---:|---:|---:|---|'];
for(const item of catalog.results){
  const video=byID.get(item.id), state=reviews.get(item.id)?.status==='content-mismatch-suspected'?'Quadro com conteúdo divergente: investigar':video?.image?`Sim: ep. ${video.episode}, ${video.seconds}s`:(video?.state==='not-attempted-unreleased'?'Futuro: não reproduzido':video?.state==='starting'?`Em teste: ${video.phase||'sessão'}`:video?`Não confirmada: ${video.state} (${video.phase||'preparação'})`:'Pendente');
  const retry=retryByID.get(item.id);
  const outcome=retry?.image&&!video?.image?`Sim no reteste: ep. ${retry.episode}, ${retry.seconds}s (1ª: ${video.state})`:state;
  lines.push(`| ${item.title.replaceAll('|','/')} | ${item.group} | ${item.indexed} | ${item.lastConfirmed??'—'} | ${item.nextFuture??'—'} | ${outcome} |`);
}
lines.push('','## Achados de navegação','',
'- One Piece 1180: a suspeita inicial causada pela imagem aos 2 s foi esclarecida. Aos 10 s aparece a marca Toei Animation; aos 20 s aparece o anime esperado. Duração de 1.415,72 s. A vinheta do estúdio não é evidência de fonte trocada.',
'- O botão Assistir do lobby abre a obra, sem selecionar diretamente o último episódio confirmado.',
'- O calendário informa horário previsto, sem declarar transmissão concluída; não oferece indicação direta do número do último episódio confirmado.',
'- Naruto: grade com 220 episódios; o episódio 220 abriu corretamente e Próximo ficou desativado. Falta um atalho ao fim da grade extensa.',
'- Universo Naruto: 23 lançamentos conectados carregados, incluindo Boruto e derivados. Boruto Part 2 tem status NOT_YET_RELEASED no catálogo, mas seu card mostrou somente formato e ano desconhecido, sem destacar Em Breve.',
'- Bleach: a consulta do episódio 9 da obra atual retornou tanto releases Kashin-tan 09 quanto a numeração acumulada S01E49/S17E49. Essa diferença de numeração é esperada no mapeamento e não indica, isoladamente, episódio errado.',
'- Hotaru no Yomeiri: último com data passada é 3, mas a grade oferece 1–8 sem distinguir ali os futuros 4–8. A tela do episódio 4 mostra 30/10/2026, mas permite entrar no contexto e marcar concluído.',
'- Tokyo Revengers: Santen Sensou-hen: último com data passada é 4; a grade também oferece 5–8.',
'- Uchi no Otouto-domo ga Sumimasen: último com data passada é 16; a grade inclui 17–20.',
'- Frieren, Solo Leveling 2 e Chainsaw Man: Reze têm total informado, mas não têm grade navegável nesta geração. Não confundir total conhecido com episódios indexados.',
'- Obras sem datas suficientes não receberam último lançamento inventado. Para completas com grade, o teste de imagem usa o último número indexado; sem grade usa episódio 1 e isso não corrige a navegação.',
'- Três obras futuras pertencem à amostra de navegação, não ao denominador de reprodução. Ausência de fonte, indisponibilidade, tempo esgotado e imagem decodificada são resultados diferentes.',
'','## Evidências','',
'- `storage/app/catalog/probes/twenty-anime/catalog.json`',
'- `storage/app/catalog/probes/twenty-anime/playback.json`',
'- `storage/app/catalog/probes/twenty-anime/frieren-empty-grid.png`',
'- `storage/app/catalog/probes/twenty-anime/hotaru-future-episodes.png`');
fs.writeFileSync('docs/twenty-anime-basic-validation.md',lines.join('\n')+'\n');
console.log(JSON.stringify({sample:catalog.count,finished:playback.results.filter(item=>item.state!=='starting').length,firstImages:playback.results.filter(item=>item.image).length,imagesIncludingRetries:catalog.results.filter(item=>byID.get(item.id)?.image||retryByID.get(item.id)?.image).length,pending:catalog.count-playback.results.filter(item=>item.state!=='starting').length}));
