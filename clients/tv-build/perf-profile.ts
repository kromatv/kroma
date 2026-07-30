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
import { type CDPSession, chromium, type Page } from 'playwright';

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

interface CpuProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
  children?: number[];
}
interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

// Self time per function, the Performance panel's "Bottom-Up" view. Frames are
// merged by name + script so the same function called from ten places reads as
// one line, which is what makes a regression obvious.
function bottomUp(
  profile: CpuProfile,
  window?: { start: number; end: number } | null,
): { label: string; ms: number; pct: number }[] {
  const byNode = new Map<number, CpuProfileNode>();
  for (const n of profile.nodes) byNode.set(n.id, n);

  // Sample-accurate self time: each sample's delta belongs to the node it hit.
  // `timeDeltas` are gaps BETWEEN samples, so walking them also reconstructs each
  // sample's timestamp - which is what lets a window select part of the run.
  const self = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let at = profile.startTime;
  let counted = 0;
  for (let i = 0; i < samples.length; i += 1) {
    at += deltas[i] ?? 0;
    if (window && (at < window.start || at > window.end)) continue;
    const id = samples[i] as number;
    const ms = Math.max(0, (deltas[i] ?? 0) / 1000);
    self.set(id, (self.get(id) ?? 0) + ms);
    counted += ms;
  }
  const total = window
    ? Math.max(1, counted)
    : Math.max(1, profile.endTime - profile.startTime) / 1000;

  const merged = new Map<string, number>();
  for (const [id, ms] of self) {
    const node = byNode.get(id);
    if (!node) continue;
    const frame = node.callFrame;
    const where = frame.url ? frame.url.split('/').pop() : '';
    const name = frame.functionName || '(anonymous)';
    const label = where ? `${name}  ${where}:${frame.lineNumber + 1}` : name;
    merged.set(label, (merged.get(label) ?? 0) + ms);
  }

  return [...merged]
    .map(([label, ms]) => ({
      label,
      ms: Math.round(ms),
      pct: Math.round((ms / total) * 1000) / 10,
    }))
    .sort((a, b) => b.ms - a.ms);
}

interface TraceEvent {
  name: string;
  ph: string;
  ts?: number;
  dur?: number;
  args?: { data?: { type?: string } };
}

// The worst task's window, in trace microseconds. A long task IS the stutter -
// the frame the eye sees - so it deserves attribution rather than a number.
function longestTaskWindow(events: TraceEvent[]): { start: number; end: number } | null {
  let best: TraceEvent | null = null;
  for (const e of events) {
    if (e.ph !== 'X' || e.name !== 'RunTask' || e.dur == null || e.ts == null) continue;
    if (!best || e.dur > (best.dur ?? 0)) best = e;
  }
  if (!best?.ts || !best.dur) return null;
  return { start: best.ts, end: best.ts + best.dur };
}

// What the Performance panel calls the summary: how long the main thread spent
// in each kind of work, plus the long tasks that are the visible stutters.
function traceSummary(events: TraceEvent[]): Record<string, number> {
  const KINDS = new Set([
    'RunTask',
    'FunctionCall',
    'UpdateLayoutTree', // "Recalculate Style"
    'Layout',
    'Paint',
    'UpdateLayerTree',
    'CompositeLayers',
    'ParseHTML',
    'GCEvent',
    'MajorGC',
    'MinorGC',
  ]);
  const out: Record<string, number> = {};
  let longTasks = 0;
  let longest = 0;
  for (const e of events) {
    if (e.ph !== 'X' || e.dur == null) continue;
    if (e.name === 'RunTask') {
      const ms = e.dur / 1000;
      if (ms >= 50) longTasks += 1;
      longest = Math.max(longest, ms);
    }
    if (KINDS.has(e.name)) out[e.name] = Math.round((out[e.name] ?? 0) + e.dur / 1000);
  }
  out.longTasks = longTasks;
  out.longestTaskMs = Math.round(longest);
  return out;
}

// Collect the tracing stream the Tracing domain emits after `Tracing.end`.
function collectTrace(cdp: CDPSession): { events: Promise<TraceEvent[]> } {
  const chunks: TraceEvent[] = [];
  let settle: (v: TraceEvent[]) => void = () => {};
  const events = new Promise<TraceEvent[]>((resolve) => {
    settle = resolve;
  });
  cdp.on('Tracing.dataCollected', (e) => {
    chunks.push(...((e as { value: TraceEvent[] }).value ?? []));
  });
  cdp.on('Tracing.tracingComplete', () => settle(chunks));
  return { events };
}

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
