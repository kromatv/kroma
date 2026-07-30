#!/usr/bin/env bun
// Profiles the app on a Tizen television over CDP. Playwright cannot be used:
// Tizen exposes only per-PAGE websockets, no browser-level endpoint.
//
//   ~/tizen-studio/tools/sdb shell 0 debug KromaTV001.KROMA   # prints a port
//   ~/tizen-studio/tools/sdb forward tcp:<port> tcp:<port>
//   bun clients/tv-build/perf-tv.ts --port <port> --scenario browse
//
// The TV's dev shell points at this machine, so serve the production build on
// :5174 first (bunx vite preview --host).

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};

const PORT = flag('port', '');
const SCENARIO = flag('scenario', 'browse');
const RECORD_MS = Number(flag('ms', '12000'));
// Much faster than this and the measurement is of key queueing, not of the app.
const KEY_MS = Number(flag('keyms', '260'));

// Style overrides injected at run time to remove one visual effect and
// re-measure; nothing needs rebuilding between runs.
const ABLATIONS: Record<string, string> = {
  none: '',
  shadows: '*{box-shadow:none !important}',
  gradients: '*{background-image:none !important}',
  // Hidden rather than removed, so the layout the image causes is still there.
  images: 'img{visibility:hidden !important}',
  transitions: '*{transition:none !important;animation:none !important}',
  transforms: '*{transform:none !important}',
  'transition-transform-only': '*{transition-property:transform !important}',
  'transition-no-shadow': '*{transition-property:transform,background-color !important}',
  all: '*{box-shadow:none !important;background-image:none !important;transition:none !important;animation:none !important;transform:none !important}img{visibility:hidden !important}',
};
const ABLATE = flag('ablate', 'none');

if (!PORT) {
  console.error('--port is required (from `sdb shell 0 debug <appid>`)');
  process.exit(1);
}

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
  if (typeof message.id !== 'number') return; // an event, not an answer
  pending.get(message.id)?.(message.result);
  pending.delete(message.id);
});

function send<T = Record<string, unknown>>(method: string, params: unknown = {}): Promise<T> {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((settle) => pending.set(id, (result) => settle(result as T)));
}

async function evaluate<T>(expression: string): Promise<T> {
  const answer = await send<{ result?: { value?: T } }>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return answer.result?.value as T;
}

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
  // Three rights along the top nav: Accueil, Films, Series, Genres.
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
