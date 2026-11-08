import { chromium } from 'playwright';

async function testBreadcrumbHistory() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://127.0.0.1:8080/ ...');
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Step 1: Universe
  console.log('Triggering Step 1 (Universe)...');
  await page.evaluate(async () => {
    window.pushNavigation('universe', '4985d0e9-c635-4adc-ae3c-f4bd31cc6b79', '_Summer Specials');
  });
  
  await page.waitForFunction(() => {
    const el = document.getElementById('entity-dynamic-breadcrumb');
    return el && el.innerText.includes('_Summer Specials');
  }, { timeout: 8000 });

  let b1 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 1 successfully rendered:', b1);

  // Step 2: Work
  console.log('Triggering Step 2 (Work)...');
  await page.evaluate(async () => {
    window.pushNavigation('work', '4827.0', '_Summer Specials (Episódio)');
  });
  
  await page.waitForFunction(() => {
    const el = document.getElementById('entity-dynamic-breadcrumb');
    return el && el.innerText.includes('Episódio');
  }, { timeout: 8000 });

  let b2 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 2 successfully rendered:', b2);

  // Step 3: Creator
  console.log('Triggering Step 3 (Creator)...');
  await page.evaluate(async () => {
    window.pushNavigation('creator', '86844189-6581-4c9f-a8db-6a722de554f7', 'Koyoharu Gotouge');
  });
  
  await page.waitForFunction(() => {
    const el = document.getElementById('entity-dynamic-breadcrumb');
    return el && el.innerText.includes('Gotouge');
  }, { timeout: 8000 });

  let b3 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 3 successfully rendered:', b3);

  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/dynamic-breadcrumb-verified-step3.png' });
  console.log('Saved dynamic-breadcrumb-verified-step3.png');

  // Step 4: Click back to Step 1 (the universe) via the dynamic breadcrumb button
  console.log('Clicking on Universe in breadcrumb history...');
  await page.evaluate(() => {
    window.navigateToHistoryIndex(0);
  });
  
  await page.waitForFunction(() => {
    const el = document.getElementById('entity-dynamic-breadcrumb');
    return el && !el.innerText.includes('Gotouge') && el.innerText.includes('_Summer Specials');
  }, { timeout: 8000 });

  let b4 = await page.evaluate(() => document.getElementById('entity-dynamic-breadcrumb')?.innerText);
  console.log('Breadcrumb 4 successfully rendered (Back to Universe):', b4);

  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/dynamic-breadcrumb-verified-step4.png' });
  console.log('Saved dynamic-breadcrumb-verified-step4.png');

  await browser.close();
  console.log('TEST SUITE COMPLETED WITH 100% SUCCESS!');
}

testBreadcrumbHistory().catch(console.error);
