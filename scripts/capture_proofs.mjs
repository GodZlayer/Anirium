import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://127.0.0.1:8080 (domcontentloaded)...');
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);

  // 1. Screenshot Home / Topbar
  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/proof-topbar.png' });
  console.log('Saved proof-topbar.png');

  // 2. Open Calendar View
  await page.click('#top-nav-calendar');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/proof-calendar.png' });
  console.log('Saved proof-calendar.png');

  // 3. Open Explore View
  await page.click('#top-nav-explore');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/proof-explore.png' });
  console.log('Saved proof-explore.png');

  // 4. Open Profile / Add-ons Modal if trigger exists
  const profileTrigger = await page.$('#user-profile-trigger');
  if (profileTrigger) {
    await profileTrigger.click();
    await page.waitForTimeout(600);
    // Click on Addons tab
    const addonsTab = await page.$('#tab-addons-btn, button:has-text("Add-ons")');
    if (addonsTab) {
      await addonsTab.click();
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/proof-addons.png' });
    console.log('Saved proof-addons.png');
  }

  await browser.close();
  console.log('Playwright tests finished successfully!');
})();
