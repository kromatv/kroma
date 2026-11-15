import { basename } from 'node:path';
import type { LogLine } from '../../shared/run';
import { type InstallContext, stringOption } from '../platform';
import { AdbConnection, AdbUnauthorized, AdbUnpaired } from './adb/connection';
import { installApk, shell } from './adb/install-apk';
import { adbKeys } from './adb/key';
import { androidAppId } from './app-id';
import { adbEndpoint } from './endpoint';
import { PAIRING_STEPS, pairingCode, pairSet } from './pair-set';

const LEANBACK = 'android.intent.category.LEANBACK_LAUNCHER';
const ALLOW_PROMPT =
  'the TV asks to allow this computer: accept the prompt on the TV, and tick Always allow';
const NO_ADB =
  'the TV does not answer adb: turn on Wireless debugging, or Network debugging, in Developer options';

function reason(error: unknown): Error {
  if (error instanceof AdbUnauthorized) {
    return new Error(`${error.message}: accept the prompt on screen, then run this again`);
  }
  if (error instanceof AdbUnpaired) {
    return new Error(`${error.message}: ${PAIRING_STEPS}, then give the code with --pairing-code`);
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

async function connect(host: string, typed: string | undefined, log: LogLine) {
  const endpoint = await adbEndpoint(host);
  if (!endpoint) throw new Error(NO_ADB);
  const open = async () =>
    AdbConnection.open(host, endpoint.port, {
      keys: await adbKeys(),
      onPrompt: () => log(ALLOW_PROMPT),
    });

  try {
    return await open();
  } catch (error) {
    if (!(error instanceof AdbUnpaired) || typed === undefined) throw reason(error);
  }
  const code = pairingCode(typed);
  if (code === null) throw new Error('a pairing code is the six digits the TV shows');
  log('pairing this computer with the TV');
  await pairSet(host, code);
  return open().catch((error: unknown) => {
    throw reason(error);
  });
}

/**
 * Installs KROMA over adb spoken by this tool itself: no adb to download.
 * The first time, the TV asks to trust this computer: with a prompt the owner
 * accepts on a TV in Network debugging, with a pairing code on one in
 * Wireless debugging.
 */
export async function installAndroid(context: InstallContext): Promise<void> {
  const { tv, artifact, log, launch } = context;
  const connection = await connect(tv.host, stringOption(context.options, 'pairing-code'), log);

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
