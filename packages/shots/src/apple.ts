import { assertMetro } from './metro';
import { run } from './sh';
import type { Screen } from './shot';
import type { Target } from './targets';

// The tvOS simulator maps the Mac keyboard onto the Siri remote, but only
// through the Simulator app's own key handling - there is no simctl verb for a
// remote press - so keys go via System Events with Simulator frontmost.
const REMOTE_KEYS: Record<string, number> = {
  ArrowUp: 126,
  ArrowDown: 125,
  ArrowLeft: 123,
  ArrowRight: 124,
  Enter: 36,
  Escape: 53,
};

const BOOT_SETTLE_MS = 4000;
const LAUNCH_SETTLE_MS = 6000;
const KEY_SETTLE_MS = 700;

export async function captureApple(
  target: Target,
  screen: Screen,
  file: string,
  metroPort: number,
): Promise<void> {
  const udid = deviceUdid(target);
  const appId = target.appId ?? '';
  await assertMetro(metroPort, target.id, "bun run --filter '@kroma/tv-native' start");

  if (!bootedUdids().includes(udid)) {
    run('xcrun', ['simctl', 'boot', udid]);
    run('open', ['-a', 'Simulator']);
    await sleep(BOOT_SETTLE_MS);
  }

  assertInstalled(udid, appId, target);
  run('xcrun', ['simctl', 'launch', udid, appId]);
  await sleep(LAUNCH_SETTLE_MS);

  for (const key of screen.keys) {
    pressRemote(key);
    await sleep(KEY_SETTLE_MS);
  }
  await sleep(screen.settleMs);

  // simctl writes where it is told and has no stdout mode: handed `-` it
  // creates a file called "-" in the working directory and reports success.
  run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', file]);
}

const UDID = /\(([0-9A-F-]{36})\)/i;

function deviceUdid(target: Target): string {
  const wanted = target.device ?? '';
  const listed = run('xcrun', ['simctl', 'list', 'devices', 'available']);
  // "    Apple TV 4K (3rd generation) (at 1080p) (B6C6…) (Shutdown)" - the name
  // carries parentheses of its own, so it is whatever precedes the UDID rather
  // than anything a single pattern can capture without backtracking over it.
  for (const line of listed.split('\n')) {
    const found = UDID.exec(line);
    const udid = found?.[1];
    if (found && udid && line.slice(0, found.index).trim() === wanted) return udid;
  }
  throw new Error(
    `no available simulator named "${wanted}". ` +
      `\`xcrun simctl list devices available\` lists what this Mac has.`,
  );
}

function bootedUdids(): string[] {
  const listed = run('xcrun', ['simctl', 'list', 'devices', 'booted']);
  return [...listed.matchAll(/\(([0-9A-F-]{36})\) \(Booted\)/gi)].map((m) => m[1] ?? '');
}

function assertInstalled(udid: string, appId: string, target: Target): void {
  const container = run('xcrun', ['simctl', 'get_app_container', udid, appId], 'text', {
    allowFailure: true,
  });
  if (container.trim()) return;
  throw new Error(
    `${target.id}: "${appId}" is not installed on the simulator. ` +
      `This tool photographs a build, it does not make one - install it first with ` +
      `\`bun run --filter '@kroma/tv-native' ios\` (and leave Metro running).`,
  );
}

function pressRemote(key: string): void {
  const code = REMOTE_KEYS[key];
  if (code === undefined) {
    throw new Error(`no Apple TV remote mapping for "${key}"`);
  }
  run('osascript', [
    '-e',
    'tell application "Simulator" to activate',
    '-e',
    `tell application "System Events" to key code ${code}`,
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}
