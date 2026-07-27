#!/usr/bin/env bun
// Profile the app ON THE TELEVISION.
//
// Everything else in this folder measures a proxy. perf-bench.ts throttles a
// desktop browser, perf-profile.ts profiles the real bundle in headless Chrome -
// and both were wrong in the same direction, because a developer's laptop is
// idle 96% of the time doing what makes a Samsung stutter, and CPU throttling
// distorts exactly the number you came for (it reports one ~1.3s "long task"
// that is the throttler suspending the renderer, and shows up identically with
// no input at all). The only honest number comes from the television.
//
// Samsung's firmware runs a Chromium with the real DevTools Protocol on it, so
// this drives THAT: same V8 sampling profiler, same remote-key events the remote
// sends, and the app's own frame/response instrumentation read back over the
// same socket.
//
// Playwright cannot be used because Tizen exposes only per-PAGE websockets and
// no browser-level endpoint, so this speaks CDP directly - which is a few dozen
// lines and removes the dependency besides.
//
//   ~/tizen-studio/tools/sdb shell 0 debug KromaTV001.KROMA   # prints a port
//   ~/tizen-studio/tools/sdb forward tcp:<port> tcp:<port>
//   bun clients/tv-build/perf-tv.ts --port <port> --scenario browse
//
// `--serve` is the usual setup: the TV's dev shell points at this machine, so
// serve the production build on :5174 first (bunx vite preview --host).

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const PORT = flag('port', '');
const SCENARIO = flag('scenario', 'browse');
const RECORD_MS = Number(flag('ms', '12000'));
/** Gap between presses. A viewer walks a rail at roughly this pace; much faster
 * and the measurement is of key queueing rather than of the app. */
const KEY_MS = Number(flag('keyms', '260'));

/**
 * Take one thing away and measure again.
 *
 * The profile said the television spends 78% of a browse in `(program)` - not in
 * JavaScript at all - which means the cost is in style, layout, paint and
 * compositing, and a CPU profile cannot name it. So instead of guessing which
 * effect is expensive, remove one and watch the frame rate: an ablation is a
 * measurement rather than an opinion, and it runs on the real panel.
 *
 * Every override is `!important` and injected at run time, so nothing needs
 * rebuilding between runs and the app is otherwise untouched.
 */
const ABLATIONS: Record<string, string> = {
  none: '',
  // Box shadows are rasterised per repaint and the focus ring is one, drawn
  // large and blurred, moving every press.
  shadows: '*{box-shadow:none !important}',
  // Every gradient overlay: the card scrims, the genre washes, the two
  // full-screen veils behind a detail page.
  gradients: '*{background-image:none !important}',
  // Artwork decode and GPU upload. Hidden rather than removed, so the layout it
  // causes is still there and only the pixels go.
  images: 'img{visibility:hidden !important}',
  // The focus transition itself: transform, box-shadow and background-color all
  // animating together for 200ms on every move.
  transitions: '*{transition:none !important;animation:none !important}',
  // A transform promotes an element to its own compositing layer, which a TV GPU
  // pays for in memory bandwidth even when the value is 1.
  transforms: '*{transform:none !important}',
  // Animate ONLY the transform. A transform is composited - the GPU moves an
  // already-painted layer - while box-shadow and background-color are not: every
  // frame of those repaints the element and, because the ring is drawn outside
  // the box and blurred, a good deal around it too.
  'transition-transform-only': '*{transition-property:transform !important}',
  // The focus ring alone, left static: it still appears, it just does not fade.
  'transition-no-shadow': '*{transition-property:transform,background-color !important}',
  // Everything at once: the floor this screen could reach.
  all: '*{box-shadow:none !important;background-image:none !important;transition:none !important;animation:none !important;transform:none !important}img{visibility:hidden !important}',
};
const ABLATE = flag('ablate', 'none');

if (!PORT) {
  console.error('--port is required (from `sdb shell 0 debug <appid>`)');
  process.exit(1);
}

// ----- the smallest CDP client that does the job -------------------------------

interface Page {
  webSocketDebuggerUrl: string;
  url: string;
  title: string;
}

const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as Page[];
const page = pages.find((p) => p.webSocketDebuggerUrl);
if (!page) {
  console.error('no debuggable page - is the app running?');
  process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise<void>((ready, fail) => {
  socket.addEventListener('open', () => ready());
  socket.addEventListener('error', () => fail(new Error('inspector refused the connection')));
});

let nextId = 1;
const pending = new Map<number, (result: unknown) => void>();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data)) as { id?: unknown; result?: unknown };
  // The id is asserted, not assumed: this is parsed off a socket, so the cast
  // above is a claim about the wire rather than a fact about the value.
  if (typeof message.id !== 'number') return; // an event, not an answer
  pending.get(message.id)?.(message.result);
  pending.delete(message.id);
});

function send<T = Record<string, unknown>>(method: string, params: unknown = {}): Promise<T> {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((settle) => pending.set(id, (result) => settle(result as T)));
}

/** Evaluate in the page and bring the value back. */
async function evaluate<T>(expression: string): Promise<T> {
  const answer = await send<{ result?: { value?: T } }>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return answer.result?.value as T;
}

/** A real key, delivered the way the remote delivers it. */
const KEYS: Record<string, { code: number; key: string; name: string }> = {
  ArrowUp: { code: 38, key: 'ArrowUp', name: 'Up' },
  ArrowDown: { code: 40, key: 'ArrowDown', name: 'Down' },
  ArrowLeft: { code: 37, key: 'ArrowLeft', name: 'Left' },
  ArrowRight: { code: 39, key: 'ArrowRight', name: 'Right' },
  Enter: { code: 13, key: 'Enter', name: 'Enter' },
};

async function press(name: string): Promise<void> {
  const k = KEYS[name];
  if (!k) return;
  const common = {
    windowsVirtualKeyCode: k.code,
    nativeVirtualKeyCode: k.code,
    key: k.key,
    code: k.key,
    windowsKeyCode: k.code,
  };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...common });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function walk(keys: string[], forMs: number): Promise<void> {
  const until = Date.now() + forMs;
  let at = 0;
  while (Date.now() < until) {
    await press(keys[at % keys.length] as string);
    at += 1;
    await wait(KEY_MS);
  }
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  browse: () =>
    walk(
      ['ArrowDown', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowLeft'],
      RECORD_MS,
    ),
  rail: () => walk(['ArrowRight'], RECORD_MS),
  rows: () => walk(['ArrowDown', 'ArrowDown', 'ArrowUp'], RECORD_MS),
  grid: async () => {
    await press('ArrowUp');
    await wait(500);
    await press('ArrowRight');
    await wait(500);
    await press('Enter');
    await wait(4000);
    await walk(['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowDown'], RECORD_MS - 5000);
  },
  // The genre picker, and then one genre's grid. Reached through the top nav:
  // Accueil, Films, Series, Genres.
  genres: async () => {
    await press('ArrowUp');
    await wait(600);
    for (let i = 0; i < 3; i += 1) {
      await press('ArrowRight');
      await wait(400);
    }
    await press('Enter');
    await wait(5000);
    await walk(['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], RECORD_MS - 7000);
  },
  subgenre: async () => {
    await press('ArrowUp');
    await wait(600);
    for (let i = 0; i < 3; i += 1) {
      await press('ArrowRight');
      await wait(400);
    }
    await press('Enter');
    await wait(4000);
    await press('ArrowDown');
    await wait(600);
    await press('Enter');
    await wait(5000);
    await walk(['ArrowRight', 'ArrowRight', 'ArrowDown'], RECORD_MS - 12000);
  },
  idle: () => wait(RECORD_MS),
};

// ----- reading the profile ----------------------------------------------------

interface CpuProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}
interface CpuProfile {
  nodes: CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

function bottomUp(profile: CpuProfile): { label: string; ms: number; pct: number }[] {
  const byNode = new Map<number, CpuProfileNode>();
  for (const n of profile.nodes) byNode.set(n.id, n);
  const total = Math.max(1, profile.endTime - profile.startTime) / 1000;

  const self = new Map<number, number>();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i] as number;
    self.set(id, (self.get(id) ?? 0) + Math.max(0, (deltas[i] ?? 0) / 1000));
  }

  const merged = new Map<string, number>();
  for (const [id, ms] of self) {
    const frame = byNode.get(id)?.callFrame;
    if (!frame) continue;
    const where = frame.url ? frame.url.split('/').pop() : '';
    const name = frame.functionName || '(anonymous)';
    merged.set(
      where ? `${name}  ${where}:${frame.lineNumber + 1}` : name,
      (merged.get(where ? `${name}  ${where}:${frame.lineNumber + 1}` : name) ?? 0) + ms,
    );
  }
  return [...merged]
    .map(([label, ms]) => ({
      label,
      ms: Math.round(ms),
      pct: Math.round((ms / total) * 1000) / 10,
    }))
    .sort((a, b) => b.ms - a.ms);
}

// ----- the run ----------------------------------------------------------------

const scenario = SCENARIOS[SCENARIO];
if (!scenario) {
  console.error(`unknown scenario "${SCENARIO}" (have: ${Object.keys(SCENARIOS).join(', ')})`);
  process.exit(1);
}

await send('Runtime.enable');
await send('Page.enable');

const about = await evaluate<Record<string, unknown>>(`(() => ({
  url: location.href,
  cores: navigator.hardwareConcurrency,
  screen: innerWidth + 'x' + innerHeight,
  elements: document.querySelectorAll('*').length,
  controls: document.querySelectorAll('[role="button"]').length,
}))()`);
console.log(`\n  ${page.title}\n`);
for (const [k, v] of Object.entries(about)) console.log(`    ${k.padEnd(10)} ${v}`);

const css = ABLATIONS[ABLATE];
if (css === undefined) {
  console.error(`unknown ablation "${ABLATE}" (have: ${Object.keys(ABLATIONS).join(', ')})`);
  process.exit(1);
}
if (css) {
  await evaluate(`(() => {
    let el = document.getElementById('kroma-ablate');
    if (!el) { el = document.createElement('style'); el.id = 'kroma-ablate'; document.head.appendChild(el); }
    el.textContent = ${JSON.stringify(css)};
    return true;
  })()`);
  console.log(`\n    ablated   ${ABLATE}`);
}

// The app's own instrumentation, which measures the two things a viewer feels:
// how long a frame took, and how long the ring took to move after a press.
await evaluate(`(() => { const p = globalThis.KROMA_PERF; p && (p.reset(), p.start()); })()`);

await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 200 });
await send('Profiler.start');

await scenario();

const { profile } = await send<{ profile: CpuProfile }>('Profiler.stop');
const report = await evaluate<Record<string, number> | null>(
  `(() => { const p = globalThis.KROMA_PERF; if (!p) return null; const r = p.report(); p.stop(); return r; })()`,
);
const after = await evaluate<Record<string, number>>(`(() => ({
  elements: document.querySelectorAll('*').length,
  controls: document.querySelectorAll('[role="button"]').length,
  images: document.querySelectorAll('img').length,
}))()`);

console.log(`\n  ${SCENARIO}   ${Math.round((profile.endTime - profile.startTime) / 1000)}ms\n`);
if (report) {
  console.log('  as the viewer feels it');
  for (const [k, v] of Object.entries(report)) console.log(`    ${k.padEnd(16)} ${v}`);
} else {
  console.log('  (KROMA_PERF is off - enable it in device settings for frame times)');
}
console.log('\n  mounted at end');
for (const [k, v] of Object.entries(after)) console.log(`    ${k.padEnd(16)} ${v}`);

console.log('\n  self time (bottom-up)');
for (const row of bottomUp(profile).slice(0, 25)) {
  console.log(`    ${String(row.ms).padStart(6)}ms  ${String(row.pct).padStart(5)}%  ${row.label}`);
}
console.log('');

await Bun.write(
  `perf/tv-${SCENARIO}.cpuprofile`,
  JSON.stringify(profile as unknown as Record<string, unknown>),
);
console.log(`  written: perf/tv-${SCENARIO}.cpuprofile (open in DevTools > Performance)\n`);
socket.close();
