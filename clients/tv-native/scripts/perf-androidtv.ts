#!/usr/bin/env bun
// What the app costs on an Android TV, measured on the device itself.
//
// The web bench (clients/tv-build/perf-bench.ts) covers the browser targets -
// Tizen, webOS, desktop - because they all run the same react-native-web bundle
// and a throttled Chromium stands in for the TV. The NATIVE clients share none
// of that path: Apple TV and Android TV run Hermes and Fabric, where the cost
// lives in the JS thread and the mount, and nothing in this repo could see it.
//
// This closes the Android half. Android TV is Android over adb, so bamlab's
// Flashlight measures FPS, RAM and per-thread CPU from inside the device while
// the remote walks the grid - the same walk the web bench uses, so the two
// stories at least describe the same journey. There is no equivalent for tvOS;
// Apple TV is Instruments by hand, or the Hermes sampling profiler.
//
//   bun clients/tv-native/scripts/perf-androidtv.ts
//   bun clients/tv-native/scripts/perf-androidtv.ts --iterations 5 --min-fps 45
//
// Needs flashlight on PATH (`curl https://get.flashlight.dev | bash`) and a
// device: `adb devices` must list one. An emulator is a smoke test and NOT a
// measurement - a Television_4K AVD on an M-series Mac reports ~48fps for a UI
// that a real 2019 box would struggle with, because it is borrowing a desktop
// CPU. Numbers are only comparable between two runs on the SAME device.

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1] ?? fallback);
};

// Defaults to this client, overridable (`--package tv.kroma.androidtv`) so a
// build can be measured against another one on the same device - which is the
// only honest comparison there is, hardware being the biggest variable here.
const packageAt = args.indexOf('--package');
const PACKAGE = packageAt === -1 ? 'tv.kroma.tv' : (args[packageAt + 1] ?? 'tv.kroma.tv');
const ITERATIONS = flag('iterations', 3);
// Below this the walk is judged a failure. 0 disables the gate, which is the
// default: a threshold is only meaningful once it is tied to known hardware.
const MIN_FPS = flag('min-fps', 0);

const ANDROID_TOOLS = join(homedir(), 'Library/Android/sdk/platform-tools');
const ADB = join(ANDROID_TOOLS, 'adb');
const FLASHLIGHT = join(homedir(), '.flashlight/bin/flashlight');

// Flashlight shells out to a BARE `adb`, so it needs one on PATH even though
// every call this file makes is absolute. Without it the run dies in a hundred
// lines of Node internals whose only real content is `adb: command not found`.
const PATH_WITH_ADB = { ...process.env, PATH: `${ANDROID_TOOLS}:${process.env.PATH ?? ''}` };

function sh(command: string, commandArgs: string[]): string {
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: PATH_WITH_ADB,
  });
}

const devices = sh(ADB, ['devices'])
  .split('\n')
  .slice(1)
  .filter((line) => line.trim().endsWith('device'));
if (devices.length === 0) {
  console.error('No device. Start the Television_4K AVD, or plug a TV in over adb tcpip.');
  process.exit(2);
}

// The launcher entry, asked of the device rather than hardcoded: the config
// plugin owns the manifest and renames the activity when it feels like it. TV
// apps launch from LEANBACK_LAUNCHER, not the phone category.
const activity = sh(ADB, [
  'shell',
  'cmd',
  'package',
  'resolve-activity',
  '--brief',
  '-c',
  'android.intent.category.LEANBACK_LAUNCHER',
  PACKAGE,
])
  .trim()
  .split('\n')
  .pop();
if (!activity?.includes('/')) {
  console.error(
    `${PACKAGE} is not installed on ${devices.length > 1 ? 'these devices' : 'this device'}.`,
  );
  console.error('Build it first: bun run --filter @kroma/tv-native android');
  process.exit(2);
}

// The walk lives in a file because Flashlight takes a COMMAND, and it runs that
// command once per iteration with the app already cold-started by the profiler.
const work = mkdtempSync(join(tmpdir(), 'kroma-tvperf-'));
const walk = join(work, 'walk.sh');
writeFileSync(
  walk,
  [
    '#!/bin/bash',
    'set -e',
    `"${ADB}" shell am start -n "${activity}" >/dev/null 2>&1`,
    // The splash and the first rails have to be on screen before a key means
    // anything; pressing into a cold app measures the splash, not the grid.
    'sleep 4',
    'for key in DPAD_DOWN DPAD_RIGHT DPAD_RIGHT DPAD_DOWN DPAD_LEFT DPAD_UP; do',
    '  for _ in 1 2 3 4; do',
    `    "${ADB}" shell input keyevent "$key" >/dev/null 2>&1`,
    '    sleep 0.16',
    '  done',
    'done',
  ].join('\n'),
);
chmodSync(walk, 0o755);

const results = join(work, 'results.json');
console.log(`\n  ${activity}   ${ITERATIONS} iterations\n`);
try {
  sh(FLASHLIGHT, [
    'test',
    '--bundleId',
    PACKAGE,
    '--testCommand',
    walk,
    '--duration',
    '12000',
    '--iterationCount',
    String(ITERATIONS),
    '--resultsFilePath',
    results,
  ]);
} catch (err) {
  // Its failures arrive as a Node stack trace megabytes wide, wrapped twice.
  // The last few lines of stderr are the only part anyone can act on.
  const { stderr = '' } = err as { stderr?: string };
  console.error(`\n  flashlight failed.\n`);
  console.error(
    stderr
      .split('\n')
      .filter((line) => line.trim() && !line.trimStart().startsWith('at '))
      .slice(0, 6)
      .join('\n'),
  );
  console.error(`\n  Is it installed? curl https://get.flashlight.dev | bash\n`);
  process.exit(1);
}

type Sample = { fps?: number; ram?: number; cpu?: { perName?: Record<string, number> } };
const report = JSON.parse(readFileSync(results, 'utf8')) as {
  iterations: Array<{ time: number; measures: Sample[] }>;
};

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, n) => sum + n, 0) / values.length;

let worstFps = Number.POSITIVE_INFINITY;
for (const [index, iteration] of report.iterations.entries()) {
  const fps = iteration.measures.map((m) => m.fps ?? 0);
  const ram = iteration.measures.map((m) => m.ram ?? 0);
  const ui = iteration.measures.map((m) => m.cpu?.perName?.['UI Thread'] ?? 0);
  // Every thread the app owns. Over 100% is not an error - it is more than one
  // core busy, which on a four-core TV box is most of the machine.
  const all = iteration.measures.map((m) =>
    Object.values(m.cpu?.perName ?? {}).reduce((sum, n) => sum + n, 0),
  );
  worstFps = Math.min(worstFps, ...fps);
  console.log(`  run ${index + 1}`);
  // The MINIMUM is the number that matters: an average of 50 hides the half
  // second at 19 that is the whole reason someone calls the app slow.
  console.log(`    fps        avg ${mean(fps).toFixed(1)}   min ${Math.min(...fps).toFixed(1)}`);
  console.log(`    ram MB     avg ${mean(ram).toFixed(0)}    peak ${Math.max(...ram).toFixed(0)}`);
  console.log(`    cpu% ui    avg ${mean(ui).toFixed(0)}     peak ${Math.max(...ui).toFixed(0)}`);
  console.log(`    cpu% all   avg ${mean(all).toFixed(0)}    peak ${Math.max(...all).toFixed(0)}`);
}
console.log('');

if (MIN_FPS > 0 && worstFps < MIN_FPS) {
  console.error(`  worst frame rate ${worstFps.toFixed(1)} is below the ${MIN_FPS} floor.\n`);
  process.exit(1);
}
