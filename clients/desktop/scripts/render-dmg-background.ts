import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = fileURLToPath(new URL('../dmg/', import.meta.url));
const svg = await readFile(`${dir}background.svg`, 'utf8');

const browser = await chromium.launch();
try {
  for (const [scale, suffix] of [
    [1, ''],
    [2, '@2x'],
  ] as const) {
    const page = await browser.newPage({ deviceScaleFactor: scale });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    const path = `${dir}background${suffix}.png`;
    await page.locator('svg').first().screenshot({ path });
    await page.close();
    console.log(`wrote ${path}`);
  }
} finally {
  await browser.close();
}
