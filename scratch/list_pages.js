const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222'
    });

    const pages = await browser.pages();
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      console.log(`Página [${i}]: URL = ${p.url()} | Título = ${await p.title()}`);
    }
  } catch (err) {
    console.error('Erro:', err);
  }
})();
