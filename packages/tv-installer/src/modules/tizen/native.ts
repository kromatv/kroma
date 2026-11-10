import { basename } from 'node:path';
import type { LogLine } from '../../run';
import type { InstallContext } from '../module';
import { tizenAppId } from './app-id';
import { installFailure } from './install-failure';
import { connect, type SdbDevice, SDB_PORT } from './sdb';

const DUID_COMMAND = '0 getduid';
const DUID_TIMEOUT_MS = 20_000;
const DUID_LIMIT = 256;

/**
 * Installs over this tool's own sdb client, so nothing from Tizen Studio has to
 * be on the machine. The package still has to be signed for the set.
 */
export async function installOverSdb(
  context: InstallContext,
  artifact: string,
  profile: string | null,
): Promise<void> {
  const { tv, log, launch } = context;
  const application = tizenAppId();
  const device = await connect(tv.host).catch((error: unknown) => {
    const said = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${said}. Nothing answered on ${SDB_PORT}: developer mode has to be on, naming this computer as the host PC, and the set rebooted since`,
    );
  });

  try {
    log(`${device.banner} on ${tv.host}`);
    const result = await device.install(artifact, {
      appId: application,
      log,
      onProgress: progress(basename(artifact), log),
    });
    if (result.verdict !== 'success') {
      const duid = result.output.includes('certificate') ? await duidOf(device) : null;
      throw new Error(installFailure(result.output, profile, duid));
    }
    if (launch) await device.launch(application);
  } finally {
    device.close();
  }
}

async function duidOf(device: SdbDevice): Promise<string | null> {
  const printed = await device
    .shell(DUID_COMMAND, { limit: DUID_LIMIT, timeoutMs: DUID_TIMEOUT_MS })
    .catch(() => '');
  return printed.trim() || null;
}

function progress(name: string, log: LogLine): (sent: number, total: number) => void {
  let reported = 0;
  return (sent, total) => {
    const percent = total > 0 ? Math.floor((sent / total) * 100) : 0;
    if (percent < reported + 20) return;
    reported = percent;
    log(`pushing ${name}, ${percent}%`);
  };
}
