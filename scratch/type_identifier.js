const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    const page = pages[0];

    console.log('Focando campo #identifierId...');
    await page.focus('#identifierId');
    await page.keyboard.type('santoss.cog@gmail.com', { delay: 60 });
    console.log('E-mail digitado com sucesso!');

    await new Promise(r => setTimeout(r, 1000));
    await page.keyboard.press('Enter');
    console.log('Enter pressionado!');

    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: 'C:\\Users\\santo\\Documents\\Animeflix\\scratch\\step_password.png' });
    console.log('Screenshot salva em scratch/step_password.png');
  } catch (err) {
    console.error('Erro:', err);
  }
})();
