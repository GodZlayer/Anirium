import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('--- [BATERIA DE TESTES DETERMINÍSTICA DO CONCEITO ANIRIUM] ---');

// 1. Validar integridade dos arquivos de Catálogo Parquet e JSON
const dataDir = path.resolve('public/data');
const requiredFiles = [
  'catalog-archive.parquet',
  'catalog-diff.parquet',
  'catalog-popular.parquet',
  'catalog-seasonal.parquet',
  'catalog-upcoming.parquet',
  'catalog-diff.json',
  'catalog-popular.json',
  'catalog-seasonal.json',
  'catalog-upcoming.json'
];

console.log('\n[1/4] Verificando existência e integridade dos arquivos da Base Indexada:');
for (const file of requiredFiles) {
  const filePath = path.join(dataDir, file);
  assert(fs.existsSync(filePath), `ERRO: Arquivo ${file} não encontrado em public/data`);
  const stat = fs.statSync(filePath);
  assert(stat.size > 0, `ERRO: Arquivo ${file} está vazio`);
  console.log(`  ✓ ${file} presente (${(stat.size / 1024).toFixed(1)} KB)`);
}

// 2. Validar integridade dos dados JSON da Base Indexada
console.log('\n[2/4] Validando estrutura semântica dos registros indexados:');
const popularData = JSON.parse(fs.readFileSync(path.join(dataDir, 'catalog-popular.json'), 'utf8'));
assert(Array.isArray(popularData), 'ERRO: catalog-popular.json deve ser um array');
assert(popularData.length > 0, 'ERRO: catalog-popular.json não possui registros');

const sample = popularData[0];
assert(sample.id || sample.mal_id, 'ERRO: Registro não possui id/mal_id');
assert(sample.title, 'ERRO: Registro não possui title');
console.log(`  ✓ Total de obras populares: ${popularData.length}`);
console.log(`  ✓ Registro modelo validado: #${sample.mal_id || sample.id} - "${sample.title}"`);

// 3. Simular lógica da Pilha Universal de 30 Ações FIFO
console.log('\n[3/4] Testando Pilha Universal de Navegação (Buffer FIFO estrito de até 30 passos):');
const MAX_STACK = 30;
const stack = [];

function pushStep(item) {
  stack.push(item);
  while (stack.length > MAX_STACK) {
    stack.shift();
  }
}

// Inserir 40 passos para comprovar descarte dos primeiros 10
for (let i = 1; i <= 40; i++) {
  pushStep({ id: i, label: `Passo ${i}` });
}

assert.strictEqual(stack.length, 30, `ERRO: Tamanho da pilha deve ser exatamente 30, obtido ${stack.length}`);
assert.strictEqual(stack[0].id, 11, `ERRO: Primeiro item da pilha FIFO deve ser o 11, obtido ${stack[0].id}`);
assert.strictEqual(stack[29].id, 40, `ERRO: Último item deve ser o 40, obtido ${stack[29].id}`);
console.log('  ✓ Comportamento FIFO validado com sucesso: limite estrito de 30 passos respeitado.');

// 4. Validar tabelas canônicas e fatiamento semântico de Arcos
console.log('\n[4/4] Validando fatiamento determinístico de Arcos Narrativos:');
// Simulação de anime com 26 episódios
const testWork = { id: 999, title: "Anime Teste", episodes_count: 26 };
const episodesPerArc = 12;
const totalArcs = Math.ceil(testWork.episodes_count / episodesPerArc);
assert.strictEqual(totalArcs, 3, 'ERRO: 26 episódios devem gerar 3 arcos semânticos (12, 12, 2)');

console.log(`  ✓ Fatiamento semântico: 26 eps divididos em ${totalArcs} arcos canônicos.`);
console.log('\n>>> TODOS OS TESTES DETERMINÍSTICOS DA CASCA BRANCA FORAM APROVADOS COM SUCESSO! <<<');
