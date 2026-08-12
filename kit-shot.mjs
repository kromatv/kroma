import { chromium } from 'playwright';

const OUT = process.env.OUT || '/tmp';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5180/?story=chart&view=scene%3A0', {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/chart-final.png` });
console.log('ERRORS', JSON.stringify(errors.slice(0, 4)));
await browser.close();
