const fs = require('fs');
const path = require('path');

const src = path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/User Data/Default/History');
const dst = path.join(process.env.TEMP, 'EdgeHistoryCopy');

try {
  fs.copyFileSync(src, dst);
  const buf = fs.readFileSync(dst);
  const text = buf.toString('latin1');

  // Procurar client IDs (ex: \d+-[a-z0-9_]+\.apps\.googleusercontent\.com)
  const clientIds = text.match(/\d+-[a-z0-9_]+\.apps\.googleusercontent\.com/gi) || [];
  console.log('Client IDs encontrados no histórico:', Array.from(new Set(clientIds)));

  // Procurar URLs do console.cloud.google.com
  const cloudUrls = text.match(/https:\/\/console\.cloud\.google\.com\/[^\x00-\x20"'>]+/gi) || [];
  console.log('URLs do Cloud Console:', Array.from(new Set(cloudUrls)).slice(0, 15));
} catch (e) {
  console.error('Erro ao ler histórico:', e.message);
}
