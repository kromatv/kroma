import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KROMA_TOOLS } from '../../toolchain/detect';
import { ADB } from './tools';

const { extractZip, download, mkdir, chmod } = vi.hoisted(() => ({
  extractZip: vi.fn(async (_archive: string, _directory: string) => {}),
  download: vi.fn(async (_url: string, _dest: string, _log: unknown) => {}),
  mkdir: vi.fn(async (_path: string, _options?: unknown) => undefined),
  chmod: vi.fn(async (_path: string, _mode: number) => {}),
}));
vi.mock('../../install/zip', () => ({ extractZip }));
vi.mock('../../toolchain/install', () => ({ download }));
vi.mock('node:fs/promises', () => ({ mkdir, chmod }));

const running = process.platform;
const on = (platform: string) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });

beforeEach(() => {
  extractZip.mockClear();
  chmod.mockClear();
  download.mockReset();
});

afterEach(() => {
  on(running);
});

describe('ADB', () => {
  it('looks where each Android SDK layout keeps adb, and where this tool would put it', () => {
    expect(ADB.candidates?.()).toEqual([
      join(process.env.ANDROID_HOME ?? '', 'platform-tools', 'adb'),
      join(process.env.ANDROID_SDK_ROOT ?? '', 'platform-tools', 'adb'),
      join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
      join(homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'),
      join(KROMA_TOOLS, 'platform-tools', 'adb'),
    ]);
  });

  it('downloads the platform-tools Google builds for this system', async () => {
    on('linux');

    await ADB.install?.(() => {});

    expect(download.mock.calls[0]?.slice(0, 2)).toEqual([
      'https://dl.google.com/android/repository/platform-tools-latest-linux.zip',
      join(KROMA_TOOLS, 'platform-tools.zip'),
    ]);
  });

  it('unpacks them where the other tools this installs live', async () => {
    await ADB.install?.(() => {});

    expect(extractZip).toHaveBeenCalledWith(join(KROMA_TOOLS, 'platform-tools.zip'), KROMA_TOOLS);
  });

  it('makes the adb it unpacked runnable, which a zip does not carry', async () => {
    await ADB.install?.(() => {});

    expect(chmod).toHaveBeenCalledWith(join(KROMA_TOOLS, 'platform-tools', 'adb'), 0o755);
  });

  it('refuses a system Google ships no platform-tools for', async () => {
    on('freebsd');

    await expect(ADB.install?.(() => {})).rejects.toThrow(
      'no Android platform-tools build for freebsd',
    );
  });
});
