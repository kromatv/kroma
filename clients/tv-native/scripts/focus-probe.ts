#!/usr/bin/env bun
// Drives the tvOS simulator with the remote and reports what focus did.
//
// This exists because focus bugs are the ones that keep coming back, and they
// are invisible to every other check in the repo: the app compiles, the tests
// pass, the bundle builds, and the remote still cannot reach half the screen.
// The only honest signal is a real key press on a real focus engine.
//
// It is a PROBE, not an assertion: it prints what changed after each key so a
// human can read the sequence. Screens differ too much for a single pass/fail,
// and a green check that means "the screenshot bytes differ" would be worse than
// no check at all - the clock alone changes them.
//
//   bun clients/tv-native/scripts/focus-probe.ts up right down
//   bun clients/tv-native/scripts/focus-probe.ts --relaunch up up
//
// Notes learned the hard way, and why the steps below look paranoid:
//   - Key codes only reach the app when the DEVICE window is frontmost, so it
//     is raised before every single press.
//   - A LogBox banner (a warning, a disconnected Metro) takes focus and eats
//     every key until dismissed; a run that looks dead is usually this.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Yes, `.mobile` on the television app - it is the PRODUCT's id, not the phone
// app's: one App Store record carries both platforms and Apple requires them to
// share it (see ../app.config.ts). Android keeps `tv.kroma.tv`.
const BUNDLE_ID = 'tv.kroma.mobile';

// macOS key codes for the directions the remote sends.
const KEYS: Record<string, number> = {
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  ok: 36,
  menu: 53,
};

const args = process.argv.slice(2);
const relaunch = args.includes('--relaunch');
const steps = args.filter((a) => !a.startsWith('--'));
if (steps.length === 0) {
  console.error(`usage: focus-probe.ts [--relaunch] <${Object.keys(KEYS).join('|')}> ...`);
  process.exit(2);
}

function sh(command: string, commandArgs: string[]): string {
  return execFileSync(command, commandArgs, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

function osa(script: string): void {
  try {
    sh('osascript', ['-e', script]);
  } catch {
    // The Simulator may not be scriptable yet; the next raise retries.
  }
}

// The booted tvOS simulator, or nothing to probe.
function bootedDevice(): { udid: string; name: string } {
  const list = JSON.parse(sh('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'])) as {
    devices: Record<string, { udid: string; name: string; state: string }[]>;
  };
  for (const [runtime, devices] of Object.entries(list.devices)) {
    if (!runtime.includes('tvOS')) continue;
    const booted = devices.find((d) => d.state === 'Booted');
    if (booted) return { udid: booted.udid, name: booted.name };
  }
  console.error('No booted tvOS simulator. Boot one in Simulator first.');
  return process.exit(2);
}

const device = bootedDevice();
const shots = mkdtempSync(join(tmpdir(), 'kroma-focus-'));

function raise(): void {
  osa('tell application "Simulator" to activate');
  osa(
    `tell application "System Events" to tell process "Simulator" to perform action "AXRaise" of window 1`,
  );
}

function press(key: string): void {
  raise();
  osa(`tell application "System Events" to key code ${KEYS[key]}`);
}

function capture(name: string): Buffer {
  const path = join(shots, `${name}.png`);
  sh('xcrun', ['simctl', 'io', device.udid, 'screenshot', path]);
  return readFileSync(path);
}

async function wait(ms: number): Promise<void> {
  await new Promise((done) => setTimeout(done, ms));
}

console.log(`probing ${device.name}`);
if (relaunch) {
  try {
    sh('xcrun', ['simctl', 'terminate', device.udid, BUNDLE_ID]);
  } catch {
    // Not running; launching is enough.
  }
  sh('xcrun', ['simctl', 'launch', device.udid, BUNDLE_ID]);
  // The app has fonts, a session read and a bundle to evaluate before it draws.
  await wait(24_000);
}

let previous = capture('start');
for (const [index, step] of steps.entries()) {
  if (!KEYS[step]) {
    console.error(`  unknown key "${step}"`);
    continue;
  }
  press(step);
  await wait(2500);
  const next = capture(`${index + 1}-${step}`);
  console.log(`  ${step.padEnd(6)} ${next.equals(previous) ? 'nothing moved' : 'screen changed'}`);
  previous = next;
}
console.log(`\nscreenshots: ${shots}`);
