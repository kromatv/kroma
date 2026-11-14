import { basename } from 'node:path';
import type { LogLine } from '../../shared/run';
import type { InstallContext } from '../platform';
import { duidOf } from './duid';
import { installFailure, refusedChain } from './install-failure';
import type { TizenPackage } from './package-manifest';
import { reach } from './reach';

/**
 * Installs over this tool's own sdb client, so nothing from Tizen Studio has to
 * be on the machine. The package still has to be signed for the set.
 */
export async function installOverSdb(
  context: InstallContext,
  artifact: string,
  tizenPackage: TizenPackage,
  profile: string | null,
): Promise<void> {
  const { tv, log, launch } = context;
  const device = await reach(tv.host);

  try {
    log(`${device.banner} on ${tv.host}`);
    const result = await device.install(artifact, {
      appId: tizenPackage.appId,
      packageId: tizenPackage.packageId,
      type: tizenPackage.type,
      log,
      onProgress: progress(basename(artifact), log),
    });
    if (result.verdict !== 'success') {
      const duid = refusedChain(result.output) ? await duidOf(device) : null;
      throw new Error(installFailure(result.output, profile, duid));
    }
    if (launch) await device.launch(tizenPackage.appId);
  } finally {
    device.close();
  }
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
