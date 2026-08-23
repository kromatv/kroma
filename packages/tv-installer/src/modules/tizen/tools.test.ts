import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KROMA_TOOLS } from '../../toolchain/detect';
import { SDB, TIZEN_CLI, TIZEN_HOME } from './tools';

const { run, runOk, download, mkdir, which } = vi.hoisted(() => ({
  run: vi.fn(async (_command: readonly string[], _options?: unknown) => ({ code: 0, output: '' })),
  runOk: vi.fn(async (_command: readonly string[], _options?: unknown) => ''),
  download: vi.fn(async (_url: string, _dest: string, _log: unknown) => {}),
  mkdir: vi.fn(async (_path: string, _options?: unknown) => undefined),
  which: vi.fn((_binary: string): string | null => '/usr/bin/java'),
}));
vi.mock('../../run', () => ({ run, runOk }));
vi.mock('../../toolchain/install', () => ({ download }));
vi.mock('node:fs/promises', () => ({ mkdir }));
vi.stubGlobal('Bun', { which });

const running = { platform: process.platform, arch: process.arch };
const on = (platform: string, arch = 'x64') => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  Object.defineProperty(process, 'arch', { value: arch, configurable: true });
};

const installer = join(KROMA_TOOLS, 'web-cli_macos-64.bin');

beforeEach(() => {
  run.mockReset();
  runOk.mockReset();
  download.mockReset();
  which.mockReset();
  which.mockReturnValue('/usr/bin/java');
  on('darwin');
});

afterEach(() => {
  on(running.platform, running.arch);
});

describe('TIZEN_CLI', () => {
  it('looks for the CLI where Tizen Studio installs it', () => {
    expect(TIZEN_CLI.candidates?.()).toEqual([join(TIZEN_HOME, 'tools', 'ide', 'bin', 'tizen')]);
  });

  it('downloads the Tizen Studio build for this system', async () => {
    await TIZEN_CLI.install?.(() => {});

    expect(download.mock.calls[0]?.slice(0, 2)).toEqual([
      'https://download.tizen.org/sdk/Installer/tizen-studio_6.0/web-cli_Tizen_Studio_6.0_macos-64.bin',
      installer,
    ]);
  });

  it('makes the installer runnable, then unpacks it into the Tizen home', async () => {
    await TIZEN_CLI.install?.(() => {});

    expect(runOk.mock.calls.map(([command]) => command)).toEqual([
      ['chmod', '+x', installer],
      [installer, '--accept-license', '--no-java-check', TIZEN_HOME],
    ]);
  });

  it('refuses a system Tizen ships no headless installer for', async () => {
    on('win32');

    await expect(TIZEN_CLI.install?.(() => {})).rejects.toThrow(
      'Tizen Studio has no headless installer here. Install it by hand from download.tizen.org.',
    );
  });

  it('refuses to install a CLI that has no JDK to run on', async () => {
    which.mockReturnValue(null);

    await expect(TIZEN_CLI.install?.(() => {})).rejects.toThrow(
      'the Tizen CLI needs a JDK: brew install --cask temurin (or apt install default-jdk)',
    );
  });

  it('refuses an x86_64 install on an Apple silicon Mac with no Rosetta', async () => {
    on('darwin', 'arm64');
    run.mockResolvedValue({ code: 1, output: '' });

    await expect(TIZEN_CLI.install?.(() => {})).rejects.toThrow(
      'Tizen Studio is x86_64: run `softwareupdate --install-rosetta --agree-to-license` first',
    );
  });

  it('asks whether Rosetta is running before it downloads anything', async () => {
    on('darwin', 'arm64');

    await TIZEN_CLI.install?.(() => {});

    expect(run.mock.calls[0]?.[0]).toEqual(['/usr/bin/pgrep', '-q', 'oahd']);
  });
});

describe('SDB', () => {
  it('looks for the bridge where Tizen Studio installs it', () => {
    expect(SDB.candidates?.()).toEqual([join(TIZEN_HOME, 'tools', 'sdb')]);
  });
});
