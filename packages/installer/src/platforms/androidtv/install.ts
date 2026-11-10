import { basename } from 'node:path';
import type { LogLine } from '../../shared/run';
import type { InstallContext } from '../platform';
import { AdbConnection, AdbUnauthorized } from './adb/connection';
import { installApk, shell } from './adb/install-apk';
import { adbKeys } from './adb/key';
import { androidAppId } from './app-id';

const ADB_PORT = 5555;
const LEANBACK = 'android.intent.category.LEANBACK_LAUNCHER';
const ALLOW_PROMPT =
  'the TV asks to allow this computer: accept the prompt on the TV, and tick Always allow';

function reason(error: unknown): Error {
  if (error instanceof AdbUnauthorized) {
    return new Error(`${error.message}: accept the prompt on screen, then run this again`);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ECONNREFUSED') || message.includes('did not answer adb')) {
    return new Error('the TV refused adb: turn Network debugging on in Developer options');
  }
  return error instanceof Error ? error : new Error(message);
}

function progress(name: string, log: LogLine): (sent: number, total: number) => void {
  let reported = 0;
  return (sent, total) => {
    const percent = total > 0 ? Math.floor((sent / total) * 100) : 0;
    if (percent < reported + 20) return;
    reported = percent;
    log(`sending ${name}, ${percent}%`);
  };
}

/**
 * Installs KROMA over adb spoken by this tool itself: no adb to download.
 * The first time, the TV asks to trust this computer, and the install waits
 * for the owner to accept.
 */
export async function installAndroid({ tv, artifact, log, launch }: InstallContext): Promise<void> {
  const connection = await AdbConnection.open(tv.host, ADB_PORT, {
    keys: await adbKeys(),
    onPrompt: () => log(ALLOW_PROMPT),
  }).catch((error: unknown) => {
    throw reason(error);
  });

  try {
    const answer = await installApk(connection, artifact, progress(basename(artifact), log));
    if (!answer.includes('Success')) throw new Error(installFailure(answer));
    if (launch) await shell(connection, `monkey -p ${androidAppId()} -c ${LEANBACK} 1`);
  } finally {
    connection.close();
  }
}

export function installFailure(output: string): string {
  if (output.includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
    return 'a KROMA signed with another key is already there: uninstall it on the TV (Settings, Apps, KROMA), then install again';
  }
  if (output.includes('INSTALL_FAILED_VERSION_DOWNGRADE')) {
    return 'the TV already has a newer build: uninstall it first, or install a newer .apk';
  }
  const tail = output.split('\n').filter(Boolean).slice(-2).join(' / ');
  const said = tail ? `: ${tail}` : '';
  return `the TV refused the install${said}`;
}
