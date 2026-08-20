#!/usr/bin/env bun
// Profile the REAL TV app with the browser's own profiler.
//
// The sibling perf-bench.ts answers "does it feel slow" with two numbers a
// television can also report about itself. This answers the next question -
// WHERE the time goes - and it does it with Chrome DevTools' own instruments
// rather than anything hand-rolled: the V8 sampling profiler (Profiler domain,
// the same .cpuprofile the Performance panel shows) and the tracing backend
// (Tracing domain, the same trace the flame chart is drawn from). The output is
// a real .cpuprofile and a real trace.json: drop either into DevTools and you
// get the panel you would have got by profiling the TV by hand.
//
//   bun clients/tv-build/perf-profile.ts --url http://localhost:5174 \
//     --session "$(bun clients/tv-build/perf-session.ts)" --scenario browse
//
// Scenarios drive the parts of the app the remote actually feels:
//   browse  - the home rails, walked with the D-pad
//   detail  - a title's page, opened and scrolled
//   player  - playback, including the buffering overlay
//
// Everything is thrown away except the profile, the trace and the summary, so a
// run is repeatable and two runs are diffable.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { bottomUp, type CpuProfile } from './perf-cpuprofile';
import { collectTrace, longestTaskWindow, traceSummary } from './perf-trace';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const URL_ = flag('url', 'http://localhost:5174');
const OUT = flag('out', join(process.cwd(), 'perf'));
const SCENARIO = flag('scenario', 'browse');
// A Samsung TV's browser is roughly six times slower than a developer laptop; the
// absolute number is not the point, comparing two commits at the same throttle is.
const THROTTLE = Number(flag('throttle', '6'));
// localStorage to seed, as JSON. Without it the app opens on the sign-in screen
// and every scenario profiles the same empty page.
const SESSION = flag('session', process.env.KROMA_SESSION ?? '');
const RECORD_MS = Number(flag('ms', '12000'));
// Pretend to BE the television, not just to be as slow as one: the app asks the
// user agent what it is running on and changes behaviour on the answer (see
// @kroma/tv's env provider), so profiling the desktop paths and calling it a TV
// measurement is how the wrong thing gets optimised.
const UA_PRESETS: Record<string, string> = {
  tizen:
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36',
  webos:
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0 Safari/537.36',
  desktop: '',
};
const UA = UA_PRESETS[flag('ua', 'tizen')] ?? '';

/** A scripted walk. Each returns once it has driven the app for RECORD_MS. */
type Scenario = (page: Page) => Promise<void>;

async function walk(page: Page, keys: string[], everyMs: number, forMs: number): Promise<void> {
  const until = Date.now() + forMs;
  let at = 0;
  while (Date.now() < until) {
    await page.keyboard.press(keys[at % keys.length] as string);
    at += 1;
    await page.waitForTimeout(everyMs);
  }
}

const SCENARIOS: Record<string, Scenario> = {
  // The home screen: down through the rails and along them, which is what a
  // viewer does before choosing anything.
  browse: (page) =>
    walk(
      page,
      ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowLeft'],
      220,
      RECORD_MS,
    ),
  // Open the first tile and move around the page that lands.
  detail: async (page) => {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await walk(page, ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowUp'], 260, RECORD_MS - 3000);
  },
  // Into playback, then sit there: the buffering overlay and the chrome's own
  // ticking are what this scenario is for.
  player: async (page) => {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(RECORD_MS - 3000);
  },
  // The browse grid: the whole library on one screen, walked downwards. This is
  // the screen a big library makes expensive, and the one worth diffing between
  // two commits.
  grid: async (page) => {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500);
    await walk(page, ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown'], 130, RECORD_MS - 4300);
  },
  // No input at all: the cost of simply being on screen.
  idle: (page) => page.waitForTimeout(RECORD_MS),
};

const scenario = SCENARIOS[SCENARIO];
if (!scenario) {
  console.error(`unknown scenario "${SCENARIO}" (have: ${Object.keys(SCENARIOS).join(', ')})`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  ...(UA ? { userAgent: UA } : {}),
});
const cdp = await page.context().newCDPSession(page);

if (SESSION) {
  await page.goto(URL_);
  await page.evaluate((raw) => {
    for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) {
      localStorage.setItem(k, v);
    }
  }, SESSION);
}

await page.goto(URL_);
// Let the first paint, the fonts and the first screen of artwork settle: boot is
// its own problem and would swamp the steady-state numbers this is after.
await page.waitForTimeout(5000);

if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

const trace = collectTrace(cdp);
await cdp.send('Tracing.start', {
  categories: 'devtools.timeline,disabled-by-default-devtools.timeline',
  transferMode: 'ReportEvents',
});
await cdp.send('Profiler.enable');
// 10 kHz: fine enough to attribute a 16 ms frame, cheap enough not to distort it.
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');

await scenario(page);

const { profile } = (await cdp.send('Profiler.stop')) as unknown as { profile: CpuProfile };
await cdp.send('Tracing.end');
const events = await trace.events;

mkdirSync(OUT, { recursive: true });
const stamp = `${SCENARIO}-x${THROTTLE}`;
writeFileSync(join(OUT, `${stamp}.cpuprofile`), JSON.stringify(profile));
writeFileSync(join(OUT, `${stamp}.trace.json`), JSON.stringify(events));

const top = bottomUp(profile);
const summary = traceSummary(events);
const wall = Math.round((profile.endTime - profile.startTime) / 1000);

// What the screen is actually carrying when the walk ends. A television's cost
// tracks the number of MOUNTED controls more closely than anything else here, so
// it belongs next to the timings rather than in a separate tool.
const carried = await page.evaluate(() => ({
  controls: document.querySelectorAll('[role="button"]').length,
  elements: document.querySelectorAll('*').length,
  images: document.querySelectorAll('img').length,
}));

console.log(`\n  ${URL_}   ${SCENARIO}   CPU /${THROTTLE}   ${wall}ms recorded\n`);
console.log('  mounted at end');
for (const [k, v] of Object.entries(carried)) console.log(`    ${k.padEnd(20)} ${v}`);
console.log('\n  main thread');
for (const [k, v] of Object.entries(summary)) console.log(`    ${k.padEnd(20)} ${v}`);
console.log('\n  self time (bottom-up)');
for (const row of top.slice(0, 25)) {
  console.log(`    ${String(row.ms).padStart(6)}ms  ${String(row.pct).padStart(5)}%  ${row.label}`);
}

// The worst task on its own. An average hides the stutter; this is the stutter.
//
// Both halves, because the answer is regularly in the half people forget: a task
// that is all `(program)` in the CPU profile has no JavaScript in it at all, and
// what it IS doing - recalculating style, laying out, decoding an image - is only
// visible in the trace.
const worst = longestTaskWindow(events);
if (worst) {
  console.log(`\n  inside the longest task (${summary.longestTaskMs}ms)`);
  for (const row of bottomUp(profile, worst).slice(0, 8)) {
    console.log(
      `    js    ${String(row.ms).padStart(6)}ms  ${String(row.pct).padStart(5)}%  ${row.label}`,
    );
  }
  const nested = new Map<string, { ms: number; n: number }>();
  for (const e of events) {
    if (e.ph !== 'X' || e.ts == null || e.dur == null || e.name === 'RunTask') continue;
    if (e.ts < worst.start || e.ts > worst.end) continue;
    const seen = nested.get(e.name) ?? { ms: 0, n: 0 };
    nested.set(e.name, { ms: seen.ms + e.dur / 1000, n: seen.n + 1 });
  }
  for (const [name, { ms, n }] of [...nested].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)) {
    console.log(
      `    trace ${String(Math.round(ms)).padStart(6)}ms  x${String(n).padEnd(5)} ${name}`,
    );
  }
}
const written = join(OUT, `${stamp}.cpuprofile`);
console.log(`\n  written: ${written} (open in DevTools > Performance)\n`);

await browser.close();
