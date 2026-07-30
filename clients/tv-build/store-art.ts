// Rasterises the KROMA brand lockup into PNGs for the TV store packages;
// store-art.py composes the deliverables. Run via `bun run store:art`.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const REPO = new URL('../..', import.meta.url).pathname;

// `resolve()` validates nothing and the caller `mkdirSync`s the result, so the
// repo checkout is the hard boundary.
function outDirIn(repo, arg, usage) {
  if (!arg) throw new Error(usage);
  const root = resolve(repo);
  const dir = resolve(root, arg);
  if (dir !== root && !dir.startsWith(`${root}${sep}`)) {
    throw new Error(`refusing to write outside the repo: ${dir}`);
  }
  return dir;
}

const OUT_DIR = outDirIn(REPO, process.argv[2], 'usage: store-art.ts <out-dir>');
mkdirSync(OUT_DIR, { recursive: true });

function outPath(name) {
  const full = resolve(OUT_DIR, name);
  if (full !== OUT_DIR && !full.startsWith(`${OUT_DIR}${sep}`)) {
    throw new Error(`refusing to write outside ${OUT_DIR}: ${name}`);
  }
  return full;
}

async function raster(page, svgPath, width, height, out) {
  const svg = readFileSync(resolve(REPO, svgPath), 'utf8')
    .replace(/\swidth="[^"]*"/, ` width="${width}"`)
    .replace(/\sheight="[^"]*"/, ` height="${height}"`);
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}
     svg{display:block}</style>${svg}`,
    { waitUntil: 'load' },
  );
  const shot = await page.screenshot({ omitBackground: true, type: 'png' });
  writeFileSync(outPath(out), shot);
  console.log(`${out}  ${width}x${height}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

// 458x100 source rendered at 4x so it stays crisp composed down onto 1920x1080.
await raster(page, '.github/assets/kroma-lockup-ivory.svg', 1832, 400, 'lockup-ivory.png');

await browser.close();
