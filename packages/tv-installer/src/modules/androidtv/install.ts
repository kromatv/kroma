import { type LogLine, run, runOk } from '../../run';
import { requireTool } from '../../toolchain/detect';
import type { InstallContext } from '../module';
import { androidAppId } from './app-id';
import { ADB } from './tools';

const ADB_PORT = 5555;
const INSTALL_TIMEOUT_MS = 600_000;
const ALLOW_WAIT_MS = 120_000;
const ALLOW_POLL_MS = 2_000;
const LEANBACK = 'android.intent.category.LEANBACK_LAUNCHER';

export function parseAdbState(devices: string, serial: string): string | null {
  for (const line of devices.split('\n')) {
    const [found = '', state = ''] = line.trim().split(/\s+/);
    if (found === serial) return state;
  }
  return null;
}

async function allowedState(adb: string, serial: string, log: LogLine): Promise<string | null> {
  let state = parseAdbState(await runOk([adb, 'devices'], { log }), serial);
  if (state !== 'unauthorized') return state;

  log('the TV asks to allow this computer: accept the prompt on the TV, and tick Always allow');
  const until = Date.now() + ALLOW_WAIT_MS;
  while (state === 'unauthorized' && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, ALLOW_POLL_MS));
    state = parseAdbState(await runOk([adb, 'devices']), serial);
  }
  return state;
}

export async function installAndroid({ tv, artifact, log, launch }: InstallContext): Promise<void> {
  const adb = requireTool(ADB);
  const serial = `${tv.host}:${ADB_PORT}`;

  await runOk([adb, 'connect', serial], { log, timeoutMs: 25_000 });
  const state = await allowedState(adb, serial, log);
  if (state === 'unauthorized') {
    throw new Error(
      'nobody allowed this computer on the TV within two minutes: accept the prompt on screen, then run this again',
    );
  }
  if (state !== 'device') {
    throw new Error(
      `adb sees the TV as ${state ?? 'absent'}: turn Network debugging on in Developer options`,
    );
  }

  const installed = await run([adb, '-s', serial, 'install', '-r', artifact], {
    log,
    timeoutMs: INSTALL_TIMEOUT_MS,
  });
  if (installed.code !== 0) throw new Error(installFailure(installed.output));
  if (!launch) return;

  const application = androidAppId();
  await run([adb, '-s', serial, 'shell', 'monkey', '-p', application, '-c', LEANBACK, '1'], {
    log,
  });
}

export function installFailure(output: string, application = androidAppId()): string {
  if (output.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
    return `a KROMA signed with another key is already there: adb uninstall ${application}, then install again`;
  }
  if (output.includes('INSTALL_FAILED_VERSION_DOWNGRADE')) {
    return 'the TV already has a newer build: uninstall it first, or install a newer .apk';
  }
  const tail = output.split('\n').filter(Boolean).slice(-2).join(' / ');
  const said = tail ? `: ${tail}` : '';
  return `adb install failed${said}`;
}
