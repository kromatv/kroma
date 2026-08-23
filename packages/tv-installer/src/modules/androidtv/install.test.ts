import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../../television';
import type { InstallContext } from '../module';
import { installAndroid, installFailure, parseAdbState } from './install';

const { run, runOk, requireTool } = vi.hoisted(() => ({
  run: vi.fn(async (_command: readonly string[], _options?: unknown) => ({ code: 0, output: '' })),
  runOk: vi.fn(async (_command: readonly string[], _options?: unknown) => ''),
  requireTool: vi.fn(() => '/usr/bin/adb'),
}));
vi.mock('../../run', () => ({ run, runOk }));
vi.mock('../../toolchain/detect', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  requireTool,
}));
vi.mock('./app-id', () => ({ androidAppId: () => 'tv.kroma.tv' }));

const devices = [
  'List of devices attached',
  '192.168.1.34:5555\tdevice',
  '192.168.1.44:5555\tunauthorized',
  'emulator-5554\toffline',
].join('\n');

const failure = (reason: string) =>
  [
    'Performing Streamed Install',
    `adb: failed to install /out/KROMA.apk: Failure [${reason}]`,
    '',
  ].join('\n');

const shield: Television = {
  host: '192.168.1.34',
  platform: 'androidtv',
  vendor: 'Nvidia',
  name: 'Shield',
  model: 'SHIELD Android TV',
  developerMode: 'on',
  sideloadable: true,
  note: 'network debugging open on 5555',
  runtime: null,
};

const context = (overrides: Partial<InstallContext> = {}): InstallContext => ({
  tv: shield,
  artifact: '/out/KROMA.apk',
  log: () => {},
  launch: true,
  options: {},
  ...overrides,
});

const argv = () => [
  ...runOk.mock.calls.map(([command]) => command),
  ...run.mock.calls.map(([command]) => command),
];

beforeEach(() => {
  run.mockReset();
  runOk.mockReset();
  runOk.mockImplementation(async (command) => (command.includes('devices') ? devices : ''));
});

describe('parseAdbState', () => {
  it('reads the state adb holds the television in', () => {
    expect(parseAdbState(devices, '192.168.1.34:5555')).toBe('device');
  });

  it('reads the state of a set that is still asking to trust this computer', () => {
    expect(parseAdbState(devices, '192.168.1.44:5555')).toBe('unauthorized');
  });

  it('answers nothing for a serial adb does not list', () => {
    expect(parseAdbState(devices, '192.168.1.99:5555')).toBeNull();
  });
});

describe('installAndroid', () => {
  it('connects to the set on the network debugging port', async () => {
    await installAndroid(context());

    expect(argv()).toContainEqual(['/usr/bin/adb', 'connect', '192.168.1.34:5555']);
  });

  it('installs over whatever build the set already carries', async () => {
    await installAndroid(context());

    expect(argv()).toContainEqual([
      '/usr/bin/adb',
      '-s',
      '192.168.1.34:5555',
      'install',
      '-r',
      '/out/KROMA.apk',
    ]);
  });

  it('starts the app through the launcher a television has', async () => {
    await installAndroid(context());

    expect(argv()).toContainEqual([
      '/usr/bin/adb',
      '-s',
      '192.168.1.34:5555',
      'shell',
      'monkey',
      '-p',
      'tv.kroma.tv',
      '-c',
      'android.intent.category.LEANBACK_LAUNCHER',
      '1',
    ]);
  });

  it('leaves the app alone when the install was told not to launch', async () => {
    await installAndroid(context({ launch: false }));

    expect(argv().flat()).not.toContain('monkey');
  });

  it('tells the owner to accept the prompt a set is still showing', async () => {
    await expect(
      installAndroid(context({ tv: { ...shield, host: '192.168.1.44' } })),
    ).rejects.toThrow(
      'the TV is asking to allow this computer: accept the prompt on screen, then run this again',
    );
  });

  it('refuses a set adb holds in any other state', async () => {
    runOk.mockImplementation(async () => 'List of devices attached\n192.168.1.34:5555\toffline');

    await expect(installAndroid(context())).rejects.toThrow(
      'adb sees the TV as offline: turn Network debugging on in Developer options',
    );
  });

  it('refuses a set adb never listed at all', async () => {
    runOk.mockImplementation(async () => 'List of devices attached');

    await expect(installAndroid(context())).rejects.toThrow('adb sees the TV as absent');
  });

  it('answers the advice for the failure adb reported', async () => {
    run.mockResolvedValue({ code: 1, output: failure('INSTALL_FAILED_VERSION_DOWNGRADE') });

    await expect(installAndroid(context())).rejects.toThrow('the TV already has a newer build');
  });
});

describe('installFailure', () => {
  it('tells the owner to remove a KROMA that was signed with another key', () => {
    const output = failure('INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package tv.kroma.tv');

    expect(installFailure(output)).toContain('adb uninstall tv.kroma.tv');
  });

  it('tells the owner the set already has a newer build than the package', () => {
    const output = failure('INSTALL_FAILED_VERSION_DOWNGRADE');

    expect(installFailure(output)).toContain('uninstall it first, or install a newer .apk');
  });

  it('quotes what adb said when the failure is one it has no advice for', () => {
    const output = failure('INSTALL_FAILED_INSUFFICIENT_STORAGE');

    expect(installFailure(output)).toBe(
      'adb install failed: Performing Streamed Install / ' +
        'adb: failed to install /out/KROMA.apk: Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]',
    );
  });
});
