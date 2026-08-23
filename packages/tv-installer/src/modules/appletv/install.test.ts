import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runOk } from '../../run';
import { devicectl } from './devicectl';
import { installAppleTv } from './install';

vi.mock('../../run', () => ({ runOk: vi.fn() }));
vi.mock('./devicectl', async (original) => ({
  ...(await original<typeof import('./devicectl')>()),
  devicectl: vi.fn(),
}));

const plist = JSON.stringify({
  CFBundleIdentifier: 'tv.kroma.mobile',
  DTPlatformName: 'appletvos',
});

const salon = {
  identifier: '00008110-000A1B2C3D4E5F6G',
  app: '/kroma/clients/tv-native/ios/build/Products/Release-appletvos/KROMA.app',
  log: () => {},
  launch: true,
};

const args = () => vi.mocked(devicectl).mock.calls.map(([given]) => [...given]);

beforeEach(() => {
  vi.mocked(runOk).mockResolvedValue(plist);
  vi.mocked(devicectl).mockResolvedValue({ code: 0, output: '', report: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('installAppleTv', () => {
  it('reads the bundle id out of the app it is about to install', async () => {
    await installAppleTv(salon);

    expect(vi.mocked(runOk).mock.calls[0]?.[0]).toEqual([
      'plutil',
      '-convert',
      'json',
      '-o',
      '-',
      `${salon.app}/Info.plist`,
    ]);
  });

  it('installs the app on the set CoreDevice knows under that identifier', async () => {
    await installAppleTv(salon);

    expect(args()[0]).toEqual([
      'device',
      'install',
      'app',
      '--device',
      '00008110-000A1B2C3D4E5F6G',
      salon.app,
    ]);
  });

  it('starts the app it installed, over any copy the set is already running', async () => {
    await installAppleTv(salon);

    expect(args()[1]).toEqual([
      'device',
      'process',
      'launch',
      '--device',
      '00008110-000A1B2C3D4E5F6G',
      '--terminate-existing',
      'tv.kroma.mobile',
    ]);
  });

  it('leaves the app alone when it was told to install without starting it', async () => {
    await installAppleTv({ ...salon, launch: false });

    expect(args()).toHaveLength(1);
  });

  it('refuses an app that was built for the simulator', async () => {
    vi.mocked(runOk).mockResolvedValue(
      JSON.stringify({ CFBundleIdentifier: 'tv.kroma.mobile', DTPlatformName: 'appletvsimulator' }),
    );

    await expect(installAppleTv(salon)).rejects.toThrow(
      'KROMA.app was built for appletvsimulator: a real set takes an appletvos build, not a simulator one',
    );
  });

  it('refuses an app whose plist names no SDK at all', async () => {
    vi.mocked(runOk).mockResolvedValue(JSON.stringify({ CFBundleIdentifier: 'tv.kroma.mobile' }));

    await expect(installAppleTv(salon)).rejects.toThrow('built for an unnamed SDK');
  });

  it('refuses a plist too big to be one', async () => {
    vi.mocked(runOk).mockResolvedValue(`${plist}${' '.repeat(200_000)}`);

    await expect(installAppleTv(salon)).rejects.toThrow('KROMA.app carries an unreadable plist');
  });

  it('turns what devicectl reported into advice the owner can act on', async () => {
    vi.mocked(devicectl).mockResolvedValue({
      code: 1,
      output: '',
      report: {
        error: {
          userInfo: { NSLocalizedDescription: { string: 'The specified device was not found.' } },
        },
      },
    });

    await expect(installAppleTv(salon)).rejects.toThrow(
      'CoreDevice no longer knows that set: pair it again in Xcode, Window then Devices and Simulators',
    );
  });

  it('quotes the last of the output when devicectl wrote no report', async () => {
    vi.mocked(devicectl).mockResolvedValue({
      code: 1,
      output: 'ERROR: something\nERROR: else entirely\n',
      report: null,
    });

    await expect(installAppleTv(salon)).rejects.toThrow(
      'devicectl failed: ERROR: something / ERROR: else entirely',
    );
  });
});
