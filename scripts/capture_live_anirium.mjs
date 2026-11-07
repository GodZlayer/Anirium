import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  
  console.log('Navigating to https://anirium.com.br/ ...');
  await page.goto('https://anirium.com.br/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/live-anirium-home.png' });
  console.log('Saved live-anirium-home.png');
  
  // Go to explore
  await page.click('button[data-tab="explore"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/live-anirium-explore.png' });
  console.log('Saved live-anirium-explore.png');
  
  // Go to calendar
  await page.click('button[data-tab="calendar"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/live-anirium-calendar.png' });
  console.log('Saved live-anirium-calendar.png');
  
  // Click on profile modal if exists
  const profileBadge = await page.$('header div[onclick*="openProfileModal"]');
  if (profileBadge) {
    await profileBadge.click();
    await page.waitForTimeout(1000);
    const addonsTab = await page.$('button[onclick*="addons"]');
    if (addonsTab) await addonsTab.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'C:/Users/santo/.gemini/antigravity/brain/38462c93-7251-4b4a-8090-d0b212f4abbf/live-anirium-addons.png' });
    console.log('Saved live-anirium-addons.png');
  }
  
  await browser.close();
  console.log('Done!');
}

run().catch(console.error);
