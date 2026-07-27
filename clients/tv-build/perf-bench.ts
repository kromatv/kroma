#!/usr/bin/env bun
// Drives the built TV app in a real browser and prints wh
// at the remote feels
// like. The browser targets (Tizen, webOS, desktop) run this exact bundle, so a
// number here is a number there, scaled by the TV's slower CPU.i
//
// It exists because every performance claim about this app has been a guess
// until now, and the guesses were wrong: the lag was never where it looked. The
// app carries the same measurements on screen (device settings -> "Mesures de
// performance") for the TV itself; this is the desk version, repeatable and
// diffable between two commits.
//
//   bun clients/tv-build/perf-bench.ts                    # build + serve + run
//   bun clients/tv-build/perf-bench.ts --url http://…     # against a running server
//   bun clients/tv-build/perf-bench.ts --keys 40          # a longer walk
//
// Reads: FPS and the WORST frame (the stutter you can see, which an average
// hides), plus press-to-focus, which is what "laggy" actually means to someone
// holding a remote.

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const KEYS = Number(flag('keys', '24'));
/**
 * How much slower than this machine to pretend to be.
 *
 * A Samsung TV's browser is roughly six times slower than a developer laptop,
 * and an unthrottled run says "120fps, 0ms" about a screen that stutters in the
 * living room - which is exactly how the last round of guesses went wrong. The
 * absolute number is not the point; comparing two commits at the same throttle
 * is.
 */
const THROTTLE = Number(flag('throttle', '6'));
const PORT = Number(flag('port', '4999'));
const url = flag('url', '');
/** Real artwork to decode, and the rendition width to ask the server for.
 * Without these the bench measures layout only, which is not where a television
 * spends its time. */
const ART = flag('art', '');
const WIDTH = flag('w', '');
/** How big a screen to mount. The real home is around eight rails of twenty. */
const RAILS = flag('rails', '');
const TILES = flag('tiles', '');
/** How many looping animations (spinner + skeleton) run alongside the walk. The
 * player's buffering overlay is one; a loading browse grid is dozens. */
const LOADERS = flag('loaders', '');

/** The walk: down into the rails, along one, back up. The shape of real use,
 * not a synthetic hammer - a TV's cost is in scrolling rows of artwork. */
const WALK = ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];

async function serve(): Promise<() => void> {
  const preview = spawn('bunx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: new URL('../bench', import.meta.url).pathname,
    stdio: 'ignore',
  });
  await new Promise((done) => setTimeout(done, 3000));
  return () => preview.kill();
}

const stop = url ? () => {} : await serve();
const query = new URLSearchParams();
if (ART) query.set('art', ART);
if (WIDTH) query.set('w', WIDTH);
if (RAILS) query.set('rails', RAILS);
if (TILES) query.set('tiles', TILES);
if (LOADERS) query.set('loaders', LOADERS);
const origin = url || `http://localhost:${PORT}/`;
const search = query.size ? `?${query}` : '';
const target = `${origin}${search}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const cdp = await page.context().newCDPSession(page);
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

// The app stores its session per origin, so a fresh profile lands on the picker.
// Seed one from KROMA_SESSION to benchmark a real, populated home screen.
const session = process.env.KROMA_SESSION;
if (session) {
  await page.goto(target);
  await page.evaluate((raw) => {
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) {
      localStorage.setItem(k, v);
    }
  }, session);
}

await page.goto(target);
await page.waitForTimeout(4000);

await page.evaluate(() => {
  const perf = (globalThis as { KROMA_PERF?: { start(): void; reset(): void } }).KROMA_PERF;
  perf?.reset();
  perf?.start();
});

for (let at = 0; at < KEYS; at += 1) {
  await page.keyboard.press(WALK[at % WALK.length] as string);
  await page.waitForTimeout(160);
}

const report = await page.evaluate(() => {
  const perf = (globalThis as { KROMA_PERF?: { report(): unknown } }).KROMA_PERF;
  return {
    ...(perf?.report() as Record<string, number> | undefined),
    nodes: document.querySelectorAll('*').length,
    controls: document.querySelectorAll('[role="button"]').length,
  };
});

console.log(`\n  ${target}   ${KEYS} presses   CPU /${THROTTLE}\n`);
for (const [key, value] of Object.entries(report)) {
  console.log(`  ${key.padEnd(16)} ${value}`);
}
console.log('');

await browser.close();
stop();
