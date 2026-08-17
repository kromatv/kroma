// Exercises a built package in Samsung's TV simulator: every tier the engine
// gate can choose, then the remote. Not part of `bun run test`, which has to run
// on a machine without Tizen Studio; run it by hand after `bun run build:tizen`,
// or with `--tier deep` to look at one.
//
// It answers what a static check cannot: that the gate resolves the way it was
// meant to, that the package paints in the Tizen webapis environment, and that
// the remote still walks the rails. It cannot answer the engine floor, because
// the simulator is modern Chromium whatever version it is told to be, which is
// why this is a tool to run and read rather than a gate to hang a build on.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Painted, type RemoteKey, Simulator, type Tier } from './simulator.ts';

// `--dist dist-deep` points the run at a slice, which carries one tier and no
// gate: the disguise then proves the tier still runs on the engine it was cut
// for, rather than which branch a probe took.
const distArg = process.argv.includes('--dist')
  ? process.argv[process.argv.indexOf('--dist') + 1]
  : undefined;
const INDEX = fileURLToPath(new URL(`../${distArg ?? 'dist'}/index.html`, import.meta.url));
const SHOTS = process.env.KROMA_SIM_SHOTS;

const EXPECTED: Record<Tier, string> = {
  modern: './assets/',
  legacy: './legacy/index.js',
  deep: './deep/index.js',
};

const WALK: RemoteKey[] = ['down', 'right', 'right', 'left', 'up'];

// `--json` emits one machine-readable record per check, so a script or an agent
// can act on the result instead of scraping the ticks.
const JSON_OUT = process.argv.includes('--json');

interface Result {
  ok: boolean;
  label: string;
  detail: string;
  tier: Tier | 'remote';
}

const results: Result[] = [];
let scope: Tier | 'remote' = 'modern';

const check = (ok: boolean, label: string, detail = ''): void => {
  results.push({ ok, label, detail, tier: scope });
  const suffix = detail ? `  ${detail}` : '';
  if (!JSON_OUT) console.log(`  ${ok ? '✓' : '✗'} ${label}${suffix}`);
};

const say = (line: string): void => {
  if (!JSON_OUT) console.log(line);
};

function report(tier: Tier, seen: Painted, errors: readonly string[]): void {
  check(
    seen.scripts.some((src) => src.startsWith(EXPECTED[tier])),
    'gate chose this tier',
    seen.scripts.join(' '),
  );
  check(seen.rootChars > 0, 'app rendered', `${seen.rootChars} chars`);
  check(seen.tizen === 'object' && seen.webapis === 'object', 'tizen webapis present');
  check(seen.bodyBackground === 'rgb(10, 10, 12)', 'ground is the dark token', seen.bodyBackground);
  check(seen.webfontApplied, 'webfont applied, not the default serif');
  check(errors.length === 0, 'no uncaught exceptions', errors.join(' | '));
  if (tier !== 'deep') return;
  check(seen.cascadeLayers === 'undefined', 'engine reports no cascade layers');
  check(!seen.customProperties, 'engine reports no custom properties');
}

async function exerciseRemote(sim: Simulator): Promise<void> {
  scope = 'remote';
  say('\nremote');
  const start = await sim.focusRing();
  say(`  start        ${start}`);

  const stops: string[] = [];
  for (const key of WALK) {
    await sim.press(key);
    const at = await sim.focusRing();
    say(`  ${key.padEnd(12)} ${at}`);
    stops.push(at);
  }
  check(start !== 'nothing focused', 'something is focused at rest', start);
  check(
    new Set(stops).size > 1,
    'focus moves with the remote',
    `${new Set(stops).size} distinct stops`,
  );
  check(stops.at(-1) === start, 'the walk returns where it started', `${stops.at(-1)} vs ${start}`);
}

if (!existsSync(INDEX)) {
  console.error(`[simulator-check] no build at ${INDEX}. Run 'bun run build:tizen' first.`);
  process.exit(1);
}

const asked = process.argv[process.argv.indexOf('--tier') + 1];
const tiers: Tier[] =
  process.argv.includes('--tier') && asked ? [asked as Tier] : ['modern', 'legacy', 'deep'];

const sim = await Simulator.launch();
try {
  for (const tier of tiers) {
    scope = tier;
    say(`\n${tier} tier`);
    await sim.load(INDEX, tier);
    report(tier, await sim.inspect(), sim.errors());
    if (SHOTS) await sim.screenshot(join(SHOTS, `sim-${tier}.png`));
  }
  await exerciseRemote(sim);
} finally {
  sim.close();
}

const failed = results.filter((result) => !result.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ tiers, passed: failed.length === 0, results }, null, 2));
} else {
  console.log(
    failed.length === 0
      ? `\n[simulator-check] ${tiers.join(', ')} OK in the Tizen simulator`
      : `\n[simulator-check] ${failed.length} failed:\n  ${failed
          .map((result) => `${result.tier}: ${result.label} ${result.detail}`.trimEnd())
          .join('\n  ')}`,
  );
}
process.exit(failed.length === 0 ? 0 : 1);
