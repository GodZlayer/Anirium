const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222'
    }).catch(async () => {
      // Se não estiver em 9222, abre com porta remota
      return null;
    });

    if (!browser) {
      console.log('Browser não conectado diretamente em 9222');
      return;
    }

    const pages = await browser.pages();
    console.log('Páginas abertas:', pages.length);
    for (const p of pages) {
      console.log('URL:', p.url(), 'Title:', await p.title());
    }
  } catch (e) {
    console.error('Erro:', e.message);
  }
})();
