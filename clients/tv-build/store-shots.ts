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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const REPO = new URL('../..', import.meta.url).pathname;
const port = process.argv[2];
if (!port) throw new Error('usage: store-shots.ts <preview-port> <out-dir>');

// `resolve()` canonicalizes the CLI argument but validates nothing - it will hand
// back `/etc` just as readily as `.store-art`, and the next line is an `mkdirSync`.
// A build script has no business creating directories outside the checkout, so
// that is the boundary enforced here.
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

// Refuses anything that climbs out of the output directory: `join()` will happily
// walk out of the directory it was handed, and a build script writing outside the
// place it was pointed at is the failure worth making impossible.
function outPath(name) {
  const full = resolve(OUT_DIR, name);
  if (full !== OUT_DIR && !full.startsWith(`${OUT_DIR}${sep}`)) {
    throw new Error(`refusing to write outside ${OUT_DIR}: ${name}`);
  }
  return full;
}

// The brand intro plays on a cold launch and cannot be skipped from outside the
// app, so the first capture waits it out.
const INTRO_MS = 10_000;

// Samsung's per-screenshot ceiling. LG has none worth worrying about.
const SAMSUNG_MAX_BYTES = 500 * 1024;

// A signed-in session to seed into localStorage before the app boots, as a JSON
// file of `{ "kroma.session": "…", "kroma.accounts": "…", … }`.
//
// The screens worth showing a buyer are all behind a profile, and a TV cannot be
// signed in from the outside: its router is in-memory (no URL to deep-link) and
// its session lives in localStorage. Without a seed this run can only ever
// photograph the picker. Lift the values off a device that IS signed in - the
// webOS simulator's DevTools, say - and point this at them:
//
//   KROMA_SHOT_SEED=~/kroma-shot-session.json bun clients/tv-build/store-shots.ts …
//
// The file holds a real session token. Keep it out of the repo.
const SEED = process.env.KROMA_SHOT_SEED;

// The story the listing tells, in order. `keys` are pressed BEFORE the capture,
// starting from wherever the previous screen left focus.
//
// Two sets, because the app opens on a different screen depending on whether a
// session was seeded. The signed-out pair is the same on every install; the
// signed-in sequence depends on the SHAPE of the catalogue behind it, so tune it
// against your own server using the on-screen text printed after every step.
const SIGNED_OUT = [
  { name: '00-profiles', keys: [] },
  { name: '01-settings', keys: ['ArrowDown', 'Enter'] },
];

const SIGNED_IN = [
  // Home, focus resting on the hero's play button: the frame webOS 6.0+ shows on
  // the Apps main screen, so it leads.
  { name: '00-home', keys: [] },
  { name: '01-detail', keys: ['ArrowDown', 'ArrowRight', 'Enter'] },
  { name: '02-browse', keys: ['Escape', 'ArrowUp', 'ArrowRight', 'Enter'] },
  { name: '03-search', keys: ['ArrowUp', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'Enter'] },
];

const SCREENS = SEED ? SIGNED_IN : SIGNED_OUT;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));

if (SEED) {
  const entries = JSON.parse(readFileSync(SEED, 'utf8'));
  await page.addInitScript((seeded) => {
    for (const [k, v] of Object.entries(seeded)) localStorage.setItem(k, v);
  }, entries);
}

// Press a remote key, letting the focus animation settle afterwards.
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
  // Samsung takes JPG only, capped at 500 kB - and a 1920x1080 frame of TV
  // artwork is several MB as PNG. Step the quality down until it fits rather
  // than picking one number that is either lossy for the simple screens or too
  // big for the busy ones. LG takes the PNG next to it.
  let jpeg: Buffer | undefined;
  for (const quality of [92, 82, 72, 62]) {
    jpeg = await page.screenshot({ type: 'jpeg', quality });
    if (jpeg.length <= SAMSUNG_MAX_BYTES) break;
  }
  if (!jpeg) throw new Error('screenshot produced no jpeg');
  writeFileSync(outPath(`${name}.jpg`), jpeg);
  if (jpeg.length > SAMSUNG_MAX_BYTES) {
    console.log(`  ! ${name}.jpg is ${Math.round(jpeg.length / 1024)} kB - over Samsung's 500 kB`);
  }
  // Collapse the runs of blank space around newlines. Bounded: an unbounded
  // `\s*` on both sides of `\n+` is three quantifiers competing for the same
  // whitespace, over a whole page of text.
  const text = await page.locator('body').innerText();
  const seen = text.replace(/[^\S\n]{0,64}\n+[^\S\n]{0,64}/g, ' · ').slice(0, 160);
  console.log(`${name}.png  ${seen}`);
}

await browser.close();
