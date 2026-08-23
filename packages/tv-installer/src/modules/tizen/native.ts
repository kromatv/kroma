import { basename } from 'node:path';
import type { LogLine } from '../../run';
import type { InstallContext } from '../module';
import { tizenAppId } from './app-id';
import { connect, describeResult } from './sdb';

/**
 * Installs over this tool's own sdb client, so nothing from Tizen Studio has to
 * be on the machine. The package still has to be signed for the set.
 */
export async function installOverSdb(context: InstallContext, artifact: string): Promise<void> {
  const { tv, log, launch } = context;
  const application = tizenAppId();
  const device = await connect(tv.host);

  try {
    log(`${device.banner} on ${tv.host}`);
    const result = await device.install(artifact, {
      appId: application,
      log,
      onProgress: progress(basename(artifact), log),
    });
    if (result.verdict !== 'success') throw new Error(describeResult('install', result));
    if (launch) await device.launch(application);
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
