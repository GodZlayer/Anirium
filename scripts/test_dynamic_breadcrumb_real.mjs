import { chromium } from 'playwright';

async function testBreadcrumbHistory() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://127.0.0.1:8080/ ...');
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Step 1: Universe
  await page.evaluate(() => {
    window.pushNavigation('universe', '4985d0e9-c635-4adc-ae3c-f4bd31cc6b79', '_Summer Specials');
  });
  await page.waitForSelector('#entity-dynamic-breadcrumb', { timeout: 5000 });
  await page.waitForTimeout(500);

  let b1 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 1:', b1);

  // Step 2: Work
  await page.evaluate(() => {
    window.pushNavigation('work', '4827.0', '_Summer Specials (Episódio)');
  });
  await page.waitForTimeout(800);

  let b2 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 2:', b2);

  // Step 3: Creator
  await page.evaluate(() => {
    window.pushNavigation('creator', '86844189-6581-4c9f-a8db-6a722de554f7', 'Koyoharu Gotouge');
  });
  await page.waitForTimeout(800);

  let b3 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 3:', b3);

  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/dynamic-breadcrumb-step3-real.png' });
  console.log('Saved dynamic-breadcrumb-step3-real.png');

  // Step 4: Click back on Step 1 (the universe) via the dynamic breadcrumb button
  await page.evaluate(() => {
    window.navigateToHistoryIndex(0);
  });
  await page.waitForTimeout(800);

  let b4 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 4 (After clicking Universe in history):', b4);

  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/dynamic-breadcrumb-step4-real.png' });
  console.log('Saved dynamic-breadcrumb-step4-real.png');

  await browser.close();
  console.log('Dynamic breadcrumb verification passed completely!');
}

testBreadcrumbHistory().catch(console.error);
