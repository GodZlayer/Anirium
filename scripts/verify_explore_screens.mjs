import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://127.0.0.1:8080...');
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);

  // 1. Switch to Explore View
  console.log('Switching to Explore...');
  await page.click('#top-nav-explore');
  await page.waitForTimeout(1000);

  // Take screenshot of default Explore (Obra / Anime)
  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/explore-pills-work.png' });
  console.log('Saved explore-pills-work.png');

  // Let's check the pills in the explore topbar
  const pills = ['universe', 'manga', 'arc', 'author', 'director', 'studio', 'music'];

  for (const pill of pills) {
    const btn = await page.$(`button.explore-kind-btn[data-kind="${pill}"]`);
    if (btn) {
      console.log(`Clicking pill: ${pill}...`);
      await btn.click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/explore-pills-${pill}.png` });
      console.log(`Saved explore-pills-${pill}.png`);
    } else {
      console.warn(`Pill button for ${pill} not found!`);
    }
  }

  // Also test Search inside Explore
  const searchInput = await page.$('#topbar-search-input');
  if (searchInput) {
    console.log('Searching for "Bleach"...');
    // First click work or universe
    await page.click('button.explore-kind-btn[data-kind="work"]');
    await page.waitForTimeout(300);
    await searchInput.fill('Bleach');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/explore-search-bleach.png' });
    console.log('Saved explore-search-bleach.png');
  }

  await browser.close();
  console.log('All Explore screens verified!');
})();
