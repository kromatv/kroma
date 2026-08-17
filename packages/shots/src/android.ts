import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { assertMetro } from './metro';
import { run } from './sh';
import type { Screen } from './shot';
import type { Target } from './targets';

// `adb shell input keyevent` names, so the same `--keys` vocabulary as the
// browser and the tvOS simulator reaches an Android TV too.
const REMOTE_KEYS: Record<string, string> = {
  ArrowUp: 'DPAD_UP',
  ArrowDown: 'DPAD_DOWN',
  ArrowLeft: 'DPAD_LEFT',
  ArrowRight: 'DPAD_RIGHT',
  Enter: 'DPAD_CENTER',
  Escape: 'BACK',
};

const BOOT_TIMEOUT_MS = 120_000;
const BOOT_POLL_MS = 2000;
const LAUNCH_SETTLE_MS = 6000;
const KEY_SETTLE_MS = 700;

export async function captureAndroid(
  target: Target,
  screen: Screen,
  file: string,
  metroPort: number,
): Promise<void> {
  await assertMetro(metroPort, target.id, "bun run --filter '@kroma/tv-native' start");
  const sdk = androidSdk();
  const adb = join(sdk, 'platform-tools', 'adb');
  const appId = target.appId ?? '';

  const serial = await bootedEmulator(sdk, adb, target);
  assertInstalled(adb, serial, appId, target);

  run(adb, [
    '-s',
    serial,
    'shell',
    'monkey',
    '-p',
    appId,
    '-c',
    'android.intent.category.LEANBACK_LAUNCHER',
    '1',
  ]);
  await sleep(LAUNCH_SETTLE_MS);

  for (const key of screen.keys) {
    const event = REMOTE_KEYS[key];
    if (!event) throw new Error(`no Android TV keyevent mapping for "${key}"`);
    run(adb, ['-s', serial, 'shell', 'input', 'keyevent', event]);
    await sleep(KEY_SETTLE_MS);
  }
  await sleep(screen.settleMs);

  writeFileSync(file, run(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], 'buffer'));
}

function androidSdk(): string {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'Library/Android/sdk'),
  ].filter((path): path is string => Boolean(path));
  const sdk = candidates.find((path) => existsSync(join(path, 'platform-tools', 'adb')));
  if (!sdk) {
    throw new Error(
      'no Android SDK found. Set ANDROID_HOME, or install the platform-tools into ~/Library/Android/sdk.',
    );
  }
  return sdk;
}

async function bootedEmulator(sdk: string, adb: string, target: Target): Promise<string> {
  const running = emulatorSerials(adb);
  if (running.length) return running[0] ?? '';

  const avd = target.avd ?? '';
  const emulator = join(sdk, 'emulator', 'emulator');
  const known = run(emulator, ['-list-avds'])
    .split('\n')
    .map((name) => name.trim());
  if (!known.includes(avd)) {
    throw new Error(
      `no AVD named "${avd}". \`${emulator} -list-avds\` shows: ${known.filter(Boolean).join(', ')}`,
    );
  }
  // Detached: the emulator holds the terminal for as long as it runs, and the
  // point is to leave it up between captures.
  spawn(emulator, ['-avd', avd, '-no-snapshot-save'], { detached: true, stdio: 'ignore' }).unref();
  return waitForBoot(adb);
}

async function waitForBoot(adb: string): Promise<string> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const serial = emulatorSerials(adb)[0];
    if (serial) {
      const booted = run(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], 'text', {
        allowFailure: true,
      });
      if (booted.trim() === '1') return serial;
    }
    await sleep(BOOT_POLL_MS);
  }
  throw new Error(`the emulator did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s`);
}

function emulatorSerials(adb: string): string[] {
  const listed = run(adb, ['devices'], 'text', { allowFailure: true });
  return listed
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter(([serial, state]) => serial?.startsWith('emulator-') && state?.trim() === 'device')
    .map(([serial]) => serial ?? '');
}

function assertInstalled(adb: string, serial: string, appId: string, target: Target): void {
  const found = run(adb, ['-s', serial, 'shell', 'pm', 'list', 'packages', appId], 'text', {
    allowFailure: true,
  });
  if (found.includes(appId)) return;
  throw new Error(
    `${target.id}: "${appId}" is not installed on the emulator. ` +
      `This tool photographs a build, it does not make one - install it first with ` +
      `\`bun run --filter '@kroma/tv-native' android\` (and leave Metro running).`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
