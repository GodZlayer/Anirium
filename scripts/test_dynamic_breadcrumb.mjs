import { chromium } from 'playwright';

async function testBreadcrumbHistory() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Opening local test http://127.0.0.1:8080/ ...');
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 1. Simulate user clicking a Universe
  await page.evaluate(() => {
    window.pushNavigation('universe', '4985d0e9-c635-4adc-ae3c-f4bd31cc6b79', '_Summer Specials');
  });
  await page.waitForTimeout(800);

  let breadcrumb1 = await page.evaluate(() => {
    return document.getElementById('entity-dynamic-breadcrumb')?.innerText;
  });
  console.log('Breadcrumb Step 1 (Universe):', breadcrumb1);

  // 2. Simulate user navigating into a Work from that Universe
  await page.evaluate(() => {
    window.pushNavigation('work', '4827.0', '_Summer Specials (Episódio Especial)');
  });
  await page.waitForTimeout(800);

  let breadcrumb2 = await page.evaluate(() => {
    return document.getElementById('entity-dynamic-breadcrumb')?.innerText;
  });
  console.log('Breadcrumb Step 2 (Work):', breadcrumb2);

  // 3. Simulate user navigating into a Creator (Author/Director) from that Work
  await page.evaluate(() => {
    window.pushNavigation('creator', 'creator-123', 'Hiroyuki Okiura');
  });
  await page.waitForTimeout(800);

  let breadcrumb3 = await page.evaluate(() => {
    return document.getElementById('entity-dynamic-breadcrumb')?.innerText;
  });
  console.log('Breadcrumb Step 3 (Creator):', breadcrumb3);

  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/dynamic-breadcrumb-step3.png' });
  console.log('Saved screenshot dynamic-breadcrumb-step3.png');

  // 4. Click back to Step 1 (the universe) in the breadcrumb
  await page.evaluate(() => {
    window.navigateToHistoryIndex(0);
  });
  await page.waitForTimeout(600);

  let breadcrumb4 = await page.evaluate(() => {
    return document.getElementById('entity-dynamic-breadcrumb')?.innerText;
  });
  console.log('Breadcrumb Step 4 (Back to Universe):', breadcrumb4);

  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/dynamic-breadcrumb-step4.png' });
  console.log('Saved screenshot dynamic-breadcrumb-step4.png');

  await browser.close();
  console.log('Breadcrumb dynamic history test finished successfully!');
}

testBreadcrumbHistory().catch(console.error);
