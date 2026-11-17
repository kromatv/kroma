import { basename } from 'node:path';
import type { LogLine } from '../../shared/run';
import type { InstallContext } from '../platform';
import { duidOf } from './duid';
import { belowPackageFloor, installFailure, refusedChain } from './install-failure';
import type { TizenPackage } from './package-manifest';
import { reach } from './reach';
import type { SdbDevice } from './sdb';

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
    await refuseOlderSet(device, context, tizenPackage);
    const result = await device.install(artifact, {
      appId: tizenPackage.appId,
      packageId: tizenPackage.packageId,
      type: tizenPackage.type,
      log,
      onProgress: progress(basename(artifact), log),
    });
    if (result.verdict !== 'success') {
      const duid = refusedChain(result.output) ? await duidOf(device) : null;
      throw installFailure(result.output, profile, duid);
    }
    if (launch) {
      await start(device, tizenPackage.appId, log);
    }
  } finally {
    device.close();
  }
}

async function refuseOlderSet(
  device: SdbDevice,
  { tv, source }: InstallContext,
  tizenPackage: TizenPackage,
): Promise<void> {
  const platform = (await device.capability()).platform_version || tv.runtime?.version;
  const refusal = belowPackageFloor(platform, tizenPackage, source);
  if (refusal) {
    throw refusal;
  }
}

async function start(device: SdbDevice, appId: string, log: LogLine): Promise<void> {
  const started = await device.launch(appId).catch((error: unknown) => ({
    verdict: 'failure' as const,
    output: error instanceof Error ? error.message : String(error),
  }));
  if (started.verdict === 'failure') {
    log(`KROMA is installed, but the set did not start it: open it from Apps (${started.output})`);
  }
}

function progress(name: string, log: LogLine): (sent: number, total: number) => void {
  let reported = 0;
  return (sent, total) => {
    const percent = total > 0 ? Math.floor((sent / total) * 100) : 0;
    if (percent < reported + 20) {
      return;
    }
    reported = percent;
    log(`pushing ${name}, ${percent}%`);
  };
}
