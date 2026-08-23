import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type LogLine, runOk } from '../../run';
import { KROMA_TOOLS, type Tool } from '../../toolchain/detect';
import { download } from '../../toolchain/install';

const PLATFORM_TOOLS_URL = 'https://dl.google.com/android/repository/platform-tools-latest';
const PLATFORM_TOOLS_BUILD: Record<string, string> = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

export const ADB: Tool = {
  id: 'adb',
  label: 'Android Debug Bridge',
  binary: 'adb',
  source: 'dl.google.com platform-tools',
  candidates: () => [
    join(process.env.ANDROID_HOME ?? '', 'platform-tools', 'adb'),
    join(process.env.ANDROID_SDK_ROOT ?? '', 'platform-tools', 'adb'),
    join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    join(homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'),
    join(KROMA_TOOLS, 'platform-tools', 'adb'),
  ],
  install: installPlatformTools,
};

async function installPlatformTools(log: LogLine): Promise<void> {
  const build = PLATFORM_TOOLS_BUILD[process.platform];
  if (!build) throw new Error(`no Android platform-tools build for ${process.platform}`);

  await mkdir(KROMA_TOOLS, { recursive: true });
  const zip = join(KROMA_TOOLS, 'platform-tools.zip');
  await download(`${PLATFORM_TOOLS_URL}-${build}.zip`, zip, log);
  await runOk(['unzip', '-q', '-o', zip, '-d', KROMA_TOOLS], { log });
}
