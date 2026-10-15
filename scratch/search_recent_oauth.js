const fs = require('fs');
const path = require('path');

const src = path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/User Data/Default/History');
const dst = path.join(process.env.TEMP, 'EdgeHistoryCopy');

try {
  fs.copyFileSync(src, dst);
  const buf = fs.readFileSync(dst);
  const text = buf.toString('latin1');

  // Procurar URLs que contenham client_id
  const clientIdMatches = text.match(/client_id=([^&"'>\s]+)/gi) || [];
  const extracted = clientIdMatches.map(m => m.replace(/client_id=/i, '')).filter(id => id.includes('googleusercontent.com'));
  
  console.log('Client IDs em query strings do histórico:');
  console.log(Array.from(new Set(extracted)));

  // Procurar também URLs do console.cloud.google.com/apis/credentials/oauthclient
  const oauthClientUrls = text.match(/https:\/\/console\.cloud\.google\.com\/apis\/credentials\/[^\x00-\x20"'>]+/gi) || [];
  console.log('URLs de credenciais acessadas no console:');
  console.log(Array.from(new Set(oauthClientUrls)));
} catch (e) {
  console.error('Erro:', e.message);
}
