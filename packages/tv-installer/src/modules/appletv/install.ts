import { basename, join } from 'node:path';
import { type LogLine, runOk } from '../../run';
import { devicectl, devicectlAdvice, failureText } from './devicectl';
import { AppBundleInfo } from './schemas';

const INSTALL_TIMEOUT_MS = 900_000;
const LAUNCH_TIMEOUT_MS = 120_000;
const PLIST_TIMEOUT_MS = 15_000;
const MAX_PLIST_BYTES = 200_000;
const TVOS_DEVICE_SDK = 'appletvos';

export interface AppleTvInstall {
  identifier: string;
  app: string;
  log: LogLine;
  launch: boolean;
}

export async function installAppleTv({
  identifier,
  app,
  log,
  launch,
}: AppleTvInstall): Promise<void> {
  const bundleId = await readBundleId(app);

  log(`installing ${basename(app)} on ${identifier}`);
  await command(['device', 'install', 'app', '--device', identifier, app], log, INSTALL_TIMEOUT_MS);
  if (!launch) return;

  log(`launching ${bundleId}`);
  const args = ['device', 'process', 'launch', '--device', identifier, '--terminate-existing'];
  await command([...args, bundleId], log, LAUNCH_TIMEOUT_MS);
}

async function command(args: readonly string[], log: LogLine, timeoutMs: number): Promise<void> {
  const { code, output, report } = await devicectl(args, { log, timeoutMs });
  if (code === 0) return;
  throw new Error(devicectlAdvice(failureText(report) ?? lastLines(output)));
}

async function readBundleId(app: string): Promise<string> {
  const plist = join(app, 'Info.plist');
  const json = await runOk(['plutil', '-convert', 'json', '-o', '-', plist], {
    timeoutMs: PLIST_TIMEOUT_MS,
  });
  if (json.length > MAX_PLIST_BYTES)
    throw new Error(`${basename(app)} carries an unreadable plist`);

  const info = AppBundleInfo.parse(JSON.parse(json));
  if (info.DTPlatformName !== TVOS_DEVICE_SDK) {
    throw new Error(
      `${basename(app)} was built for ${info.DTPlatformName ?? 'an unnamed SDK'}: a real set takes an ${TVOS_DEVICE_SDK} build, not a simulator one`,
    );
  }
  return info.CFBundleIdentifier;
}

function lastLines(output: string): string {
  return output.split('\n').filter(Boolean).slice(-2).join(' / ');
}
