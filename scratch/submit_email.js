const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222'
    });

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    console.log('Preenchendo e-mail santoss.cog@gmail.com...');
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', 'santoss.cog@gmail.com', { delay: 50 });
    
    // Clica no botão Avançar
    await page.keyboard.press('Enter');
    console.log('Enter pressionado após e-mail.');

    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: 'C:\\Users\\santo\\Documents\\Animeflix\\scratch\\after_email.png' });
    console.log('Screenshot salva em scratch/after_email.png');
  } catch (err) {
    console.error('Erro na automação do login:', err);
  }
})();
