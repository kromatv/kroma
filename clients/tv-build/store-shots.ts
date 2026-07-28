// Captures the 1920x1080 store screenshots both TV stores ask for, by driving a
// BUILT TV shell with a remote (arrow keys + Enter) in headless Chromium.
//
// Samsung wants exactly 4 at 1920x1080 (JPG, <=500kB); LG takes up to 6 at
// 1920x1080 or 1280x720. Shooting the real build rather than mocking a page
// means the store art IS the app - same fonts, same focus ring, same catalogue.
//
//   VITE_KROMA_SERVER=http://your-server:4040 bun run build:webos
//   (cd clients/webos && bunx vite preview --port 4173 --strictPort) &
//   bun clients/tv-build/store-shots.ts 4173 clients/webos/store/shots
//
// The TV router is a MEMORY history ("a TV has no address bar" - see
// packages/tv/src/app/router.tsx), so a screen is reached by pressing the keys a
// viewer would press, not by navigating to a URL. That makes the sequence below
// depend on the catalogue: how many rails home has, how many tiles precede the
// one worth photographing. Tune SCREENS against your own server, using the
// on-screen text this prints after every step to see where focus actually is.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const REPO = new URL('../..', import.meta.url).pathname;
const port = process.argv[2];
if (!port) throw new Error('usage: store-shots.ts <preview-port> <out-dir>');

/** The output directory, proven to be inside the repo before anything is
 * created in it.
 *
 * `resolve()` canonicalizes the CLI argument but validates nothing - it will
 * hand back `/etc` just as readily as `.store-art`, and the next line is an
 * `mkdirSync`. Every documented invocation writes inside the checkout
 * (`.store-art`, `clients/tizen/store/shots`, `clients/webos/store/shots`), so
 * that is the boundary: a build script has no business creating directories
 * anywhere else on the machine that runs it. */
function outDirIn(repo, arg, usage) {
  if (!arg) throw new Error(usage);
  const root = resolve(repo);
  const dir = resolve(root, arg);
  if (dir !== root && !dir.startsWith(`${root}${sep}`)) {
    throw new Error(`refusing to write outside the repo: ${dir}`);
  }
  return dir;
}

const OUT_DIR = outDirIn(REPO, process.argv[3], 'usage: store-shots.ts <preview-port> <out-dir>');
mkdirSync(OUT_DIR, { recursive: true });

/** Resolve a file INTO the output directory, refusing anything that climbs out.
 *
 * The directory is a CLI argument and the file names are literals below, so this
 * is a guard on future edits as much as on today's input: `join()` will happily
 * walk out of the directory it was handed, and a build script writing outside
 * the place it was pointed at is the failure worth making impossible. */
function outPath(name) {
  const full = resolve(OUT_DIR, name);
  if (full !== OUT_DIR && !full.startsWith(`${OUT_DIR}${sep}`)) {
    throw new Error(`refusing to write outside ${OUT_DIR}: ${name}`);
  }
  return full;
}

/** The brand intro plays on a cold launch and cannot be skipped from outside the
 * app, so the first capture waits it out. */
const INTRO_MS = 10_000;

/**
 * The story the listing tells, in order. `keys` are pressed BEFORE the capture,
 * starting from wherever the previous screen left focus.
 *
 * Only the signed-out screens are declared here, because they are the only ones
 * that are the same on every install. A server with a catalogue adds the screens
 * that actually sell the app - home, a detail page, the player - and their key
 * sequences are specific to that catalogue's shape; add them here once you point
 * this at a populated server.
 */
const SCREENS = [
  { name: '00-profiles', keys: [] },
  { name: '01-settings', keys: ['ArrowDown', 'Enter'] },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));

/** Press a remote key, letting the focus animation settle afterwards. */
async function press(key) {
  await page.keyboard.press(key);
  await page.waitForTimeout(340);
}

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(INTRO_MS);

for (const { name, keys } of SCREENS) {
  for (const key of keys) await press(key);
  await page.waitForTimeout(400);
  writeFileSync(outPath(`${name}.png`), await page.screenshot({ type: 'png' }));
  // Collapse the runs of blank space around newlines. Bounded: an unbounded
  // `\s*` on both sides of `\n+` is three quantifiers competing for the same
  // whitespace, over a whole page of text.
  const text = await page.locator('body').innerText();
  const seen = text.replace(/[^\S\n]{0,64}\n+[^\S\n]{0,64}/g, ' · ').slice(0, 160);
  console.log(`${name}.png  ${seen}`);
}

await browser.close();
