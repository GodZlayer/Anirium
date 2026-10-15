const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: 'C:\\Users\\santo\\Documents\\Animeflix\\chrome\\win64-154.0.8037.92\\chrome-win64\\chrome.exe',
      userDataDir: 'C:\\Users\\santo\\AppData\\Local\\Temp\\ChromeAutoProfile',
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=9222'
      ]
    });

    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.goto('https://console.cloud.google.com/apis/credentials', { waitUntil: 'networkidle2' });
    
    console.log('Current URL:', page.url());
    console.log('Page Title:', await page.title());

    // Tirar screenshot para sabermos exatamente o estado da tela (se pede login Google ou se já entra)
    await page.screenshot({ path: 'C:\\Users\\santo\\Documents\\Animeflix\\scratch\\console_screen.png' });
    console.log('Screenshot salva em scratch/console_screen.png');

    // Manter aberto para automação
    setInterval(() => {}, 1000);
  } catch (err) {
    console.error('Erro na automação do console:', err);
  }
})();
