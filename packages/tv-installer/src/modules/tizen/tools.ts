import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type LogLine, run, runOk } from '../../run';
import { KROMA_TOOLS, type Tool } from '../../toolchain/detect';
import { download } from '../../toolchain/install';

export const TIZEN_HOME = process.env.TIZEN_HOME ?? join(homedir(), 'tizen-studio');

const TIZEN_STUDIO_VERSION = '6.0';
const TIZEN_BUILD: Record<string, string> = { darwin: 'macos-64', linux: 'ubuntu-64' };

export const TIZEN_CLI: Tool = {
  id: 'tizen',
  label: 'Tizen Studio CLI',
  binary: 'tizen',
  source: 'download.tizen.org (~260 MB)',
  candidates: () => [join(TIZEN_HOME, 'tools', 'ide', 'bin', 'tizen')],
  install: installTizenStudio,
};

export const SDB: Tool = {
  id: 'sdb',
  label: 'Smart Debug Bridge',
  binary: 'sdb',
  source: 'part of the Tizen Studio CLI',
  candidates: () => [join(TIZEN_HOME, 'tools', 'sdb')],
  install: installTizenStudio,
};

async function installTizenStudio(log: LogLine): Promise<void> {
  const flavour = TIZEN_BUILD[process.platform];
  if (!flavour) {
    throw new Error(
      'Tizen Studio has no headless installer here. Install it by hand from download.tizen.org.',
    );
  }
  if (!Bun.which('java')) {
    throw new Error(
      'the Tizen CLI needs a JDK: brew install --cask temurin (or apt install default-jdk)',
    );
  }
  await assertRosetta();

  await mkdir(KROMA_TOOLS, { recursive: true });
  const installer = join(KROMA_TOOLS, `web-cli_${flavour}.bin`);
  const file = `web-cli_Tizen_Studio_${TIZEN_STUDIO_VERSION}_${flavour}.bin`;
  await download(
    `https://download.tizen.org/sdk/Installer/tizen-studio_${TIZEN_STUDIO_VERSION}/${file}`,
    installer,
    log,
  );
  await runOk(['chmod', '+x', installer], { log });
  log('unpacking Tizen Studio, this takes a few minutes');
  await runOk([installer, '--accept-license', '--no-java-check', TIZEN_HOME], { log });
}

async function assertRosetta(): Promise<void> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') return;
  const { code } = await run(['/usr/bin/pgrep', '-q', 'oahd']);
  if (code !== 0) {
    throw new Error(
      'Tizen Studio is x86_64: run `softwareupdate --install-rosetta --agree-to-license` first',
    );
  }
}
