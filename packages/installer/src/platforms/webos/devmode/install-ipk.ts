import { basename } from 'node:path';
import { z } from 'zod';
import type { LogLine } from '../../../shared/run';
import { type LunaAddress, lunaCall } from './luna';
import type { DevModeSession } from './session';

const DEVELOPER_TEMP = '/media/developer/temp';

const INSTALL_ID = 'com.ares.defaultName';
const INSTALL_TIMEOUT_MS = 300_000;

const INSTALL: LunaAddress = {
  service: 'com.webos.appInstallService',
  folder: 'dev',
  method: 'install',
};

const InstallReply = z.object({
  details: z.object({
    state: z.string().max(256),
    reason: z.string().max(4096).optional(),
  }),
});

function remotePackagePath(ipk: string): string {
  return `${DEVELOPER_TEMP}/${basename(ipk).replaceAll(/[^\w.-]/g, '_')}`;
}

/**
 * Puts the package in the developer temp folder, asks the install service for
 * it as `ares-install` does, and removes the package again whatever the verdict.
 * Answers the state the service ended on.
 */
export async function installIpk(
  session: DevModeSession,
  ipk: string,
  log: LogLine,
): Promise<string> {
  const remote = remotePackagePath(ipk);
  await session.run(`/usr/bin/test -d ${DEVELOPER_TEMP} || /bin/mkdir -p ${DEVELOPER_TEMP}`);
  try {
    log(`sending ${basename(ipk)}`);
    await session.put(ipk, remote);
    log('asking the TV to install it');
    return await lunaCall(
      session,
      {
        address: INSTALL,
        param: { id: INSTALL_ID, ipkUrl: remote, subscribe: true },
        timeoutMs: INSTALL_TIMEOUT_MS,
      },
      (reply) => installVerdict(reply, log),
    );
  } finally {
    await session.exec(`/bin/rm -f "${remote}"`).catch(() => undefined);
  }
}

function installVerdict(reply: unknown, log: LogLine): string | undefined {
  const parsed = InstallReply.safeParse(reply);
  if (!parsed.success) return undefined;
  const { state, reason } = parsed.data.details;
  if (/FAILED/i.test(state)) throw new Error(`the TV refused the package: ${reason ?? state}`);
  if (/installed|^SUCCESS/i.test(state)) return state;
  log(state);
  return undefined;
}
