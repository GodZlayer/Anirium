const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages[0];

    const html = await page.content();
    console.log('HTML size:', html.length);

    // Avaliar inputs na tela
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(i => ({
        type: i.type,
        id: i.id,
        name: i.name,
        placeholder: i.placeholder,
        ariaLabel: i.getAttribute('aria-label')
      }));
    });
    console.log('Inputs encontrados:', inputs);

    // Avaliar texto visível
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Texto inicial:', bodyText);
  } catch (err) {
    console.error('Erro:', err);
  }
})();
