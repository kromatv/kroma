import { run, runOk } from '../../run';
import { requireTool } from '../../toolchain/detect';
import type { InstallContext } from '../module';
import { androidAppId } from './app-id';
import { ADB } from './tools';

const ADB_PORT = 5555;
const INSTALL_TIMEOUT_MS = 600_000;
const LEANBACK = 'android.intent.category.LEANBACK_LAUNCHER';

export function parseAdbState(devices: string, serial: string): string | null {
  for (const line of devices.split('\n')) {
    const [found = '', state = ''] = line.trim().split(/\s+/);
    if (found === serial) return state;
  }
  return null;
}

export async function installAndroid({ tv, artifact, log, launch }: InstallContext): Promise<void> {
  const adb = requireTool(ADB);
  const serial = `${tv.host}:${ADB_PORT}`;

  await runOk([adb, 'connect', serial], { log, timeoutMs: 25_000 });
  const state = parseAdbState(await runOk([adb, 'devices'], { log }), serial);
  if (state === 'unauthorized') {
    throw new Error(
      'the TV is asking to allow this computer: accept the prompt on screen, then run this again',
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
