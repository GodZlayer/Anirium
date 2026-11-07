import https from 'node:https';

function requestTranslation(text, targetLang, sourceLang = 'auto') {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(text);
    const path = `/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encoded}`;
    const options = {
      hostname: 'translate.googleapis.com',
      port: 443,
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
        }
        try {
          const parsed = JSON.parse(data);
          const translated = parsed[0]?.map(c => c[0]).filter(Boolean).join('') || '';
          resolve(translated);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  for (const lang of ['pt', 'es', 'fr', 'de']) {
    try {
      const res = await requestTranslation("Frieren: Beyond Journey's End", lang, 'en');
      console.log(lang, '->', res);
    } catch (err) {
      console.error(lang, 'failed:', err.message);
    }
  }
}

run();
