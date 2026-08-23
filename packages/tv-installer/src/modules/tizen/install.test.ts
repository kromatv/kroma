import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Television } from '../../television';
import type { Tool } from '../../toolchain/detect';
import type { InstallContext } from '../module';
import { installFailure, installTizen, parseSdbSerial } from './install';
import type { SigningProfile } from './profiles';

const {
  run,
  runOk,
  locate,
  requireTool,
  installOverSdb,
  ensureProfile,
  resign,
  readDuid,
  readProfile,
  rm,
} = vi.hoisted(() => ({
  run: vi.fn(async (_command: readonly string[], _options?: unknown) => ({ code: 0, output: '' })),
  runOk: vi.fn(async (_command: readonly string[], _options?: unknown) => ''),
  locate: vi.fn((_tool: unknown): string | null => '/tizen-studio/tools/sdb'),
  requireTool: vi.fn((_tool: unknown) => ''),
  installOverSdb: vi.fn(async (_context: unknown, _artifact: string) => {}),
  ensureProfile: vi.fn(async (_log: unknown) => ({ name: 'kroma' }) as SigningProfile),
  resign: vi.fn(async (_artifact: string, _profile: unknown, _log: unknown) => ({
    path: '/tmp/kroma-wgt-1/KROMA.wgt',
    staged: false,
  })),
  readDuid: vi.fn(async (_sdb: string, _log: unknown): Promise<string | null> => null),
  readProfile: vi.fn(async (_name?: string): Promise<SigningProfile | null> => null),
  rm: vi.fn(async (_path: string, _options?: unknown) => {}),
}));
vi.mock('../../run', () => ({ run, runOk }));
vi.mock('../../toolchain/detect', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  locate,
  requireTool,
}));
vi.mock('./native', () => ({ installOverSdb }));
vi.mock('./signing', () => ({ ensureProfile, resign, readDuid }));
vi.mock('./profiles', () => ({ readProfile }));
vi.mock('./app-id', () => ({ tizenAppId: () => 'KromaTV001.KROMA' }));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  rm,
}));

const devices = [
  'List of devices attached ',
  '192.168.1.31:26101\tdevice\tUE50AU7172',
  '192.168.1.44:26101\toffline\tunknown',
  '192.168.1.45:26101\tdevice\tQE55Q60B',
  'emulator-26101\tdevice\tT-samsung-9.0-x86',
].join('\n');

const salon: Television = {
  host: '192.168.1.31',
  platform: 'tizen',
  vendor: 'Samsung',
  name: '[TV] Salon',
  model: 'UE50AU7172',
  developerMode: 'on',
  sideloadable: true,
  note: 'developer mode on',
  runtime: null,
};

const context = (overrides: Partial<InstallContext> = {}): InstallContext => ({
  tv: salon,
  artifact: '/out/KROMA-tizen-0.1.33.wgt',
  log: () => {},
  launch: true,
  options: {},
  ...overrides,
});

const SDB = '/tizen-studio/tools/sdb';
const TIZEN = '/tizen-studio/tools/ide/bin/tizen';

const argv = () => [
  ...runOk.mock.calls.map(([command]) => command),
  ...run.mock.calls.map(([command]) => command),
];

beforeEach(() => {
  run.mockReset();
  runOk.mockReset();
  locate.mockReset();
  requireTool.mockReset();
  installOverSdb.mockReset();
  ensureProfile.mockReset();
  resign.mockReset();
  readDuid.mockReset();
  readProfile.mockReset();
  rm.mockReset();
  locate.mockReturnValue(SDB);
  requireTool.mockImplementation((tool) => ((tool as Tool).id === 'sdb' ? SDB : TIZEN));
  runOk.mockImplementation(async (command) => (command.includes('devices') ? devices : ''));
  resign.mockResolvedValue({ path: '/tmp/kroma-wgt-1/KROMA.wgt', staged: false });
});

describe('parseSdbSerial', () => {
  it('reads the serial the bridge gave the television at that address', () => {
    expect(parseSdbSerial(devices, '192.168.1.31')).toBe('192.168.1.31:26101');
  });

  it('finds the set that was asked for further down the list', () => {
    expect(parseSdbSerial(devices, '192.168.1.45')).toBe('192.168.1.45:26101');
  });

  it('answers nothing for a set the bridge sees as offline', () => {
    expect(parseSdbSerial(devices, '192.168.1.44')).toBeNull();
  });

  it('answers nothing for a host the bridge never connected to', () => {
    expect(parseSdbSerial(devices, '192.168.1.99')).toBeNull();
  });
});

describe('installTizen', () => {
  it('signs the package with this machine before anything is pushed', async () => {
    await installTizen(context());

    expect(ensureProfile).toHaveBeenCalled();
    expect(resign).toHaveBeenCalledWith(
      '/out/KROMA-tizen-0.1.33.wgt',
      { name: 'kroma' },
      expect.any(Function),
    );
  });

  it('signs with the profile that was named instead of the active one', async () => {
    readProfile.mockResolvedValue({
      name: 'LUMA',
      author: { archive: '/certs/a.p12', password: 'x' },
    });

    await installTizen(context({ options: { profile: 'LUMA' } }));

    expect(readProfile).toHaveBeenCalledWith('LUMA');
    expect(ensureProfile).not.toHaveBeenCalled();
  });

  it('refuses a profile name this machine has no certificate for', async () => {
    await expect(installTizen(context({ options: { profile: 'LUMA' } }))).rejects.toThrow(
      'no signing profile called LUMA',
    );
  });

  it('talks the bridge itself on a machine with no Tizen Studio', async () => {
    locate.mockReturnValue(null);

    await installTizen(context());

    expect(installOverSdb).toHaveBeenCalledWith(expect.anything(), '/tmp/kroma-wgt-1/KROMA.wgt');
  });

  it('talks the bridge itself when --native was given, Tizen Studio or not', async () => {
    await installTizen(context({ options: { native: true } }));

    expect(installOverSdb).toHaveBeenCalled();
    expect(argv()).toEqual([]);
  });

  it('drops every other target before it connects to this one', async () => {
    await installTizen(context());

    expect(argv()).toContainEqual([SDB, 'disconnect']);
    expect(argv()).toContainEqual([SDB, 'connect', '192.168.1.31:26101']);
  });

  it('refuses a set the bridge does not hold as a device', async () => {
    runOk.mockImplementation(async () => 'List of devices attached');

    await expect(installTizen(context())).rejects.toThrow(
      'the TV refused the connection: Developer mode must list this computer as the host PC, and the set must have been rebooted since',
    );
  });

  it('installs the signed widget by name, out of the directory it was staged in', async () => {
    await installTizen(context());

    expect(argv()).toContainEqual([TIZEN, 'install', '-n', 'KROMA.wgt', '--', '/tmp/kroma-wgt-1']);
  });

  it('starts the app with the CLI once it is installed', async () => {
    await installTizen(context());

    expect(argv()).toContainEqual([TIZEN, 'run', '-p', 'KromaTV001.KROMA']);
  });

  it('falls back to was_execute when the CLI cannot start the app', async () => {
    run.mockImplementation(async (command) =>
      command.includes('run') ? { code: 1, output: 'no device' } : { code: 0, output: '' },
    );

    await installTizen(context());

    expect(argv()).toContainEqual([SDB, 'shell', '0', 'was_execute', 'KromaTV001.KROMA']);
  });

  it('leaves the app alone when the install was told not to launch', async () => {
    await installTizen(context({ launch: false }));

    expect(argv().flat()).not.toContain('was_execute');
    expect(argv()).not.toContainEqual([TIZEN, 'run', '-p', 'KromaTV001.KROMA']);
  });

  it('reads the DUID off the set when it refused the signature', async () => {
    run.mockImplementation(async (command) =>
      command.includes('install')
        ? { code: 1, output: 'error: the certificate is not valid' }
        : { code: 0, output: '' },
    );
    readDuid.mockResolvedValue('1900A2C4D6E8');

    await expect(installTizen(context())).rejects.toThrow('The DUID to register is 1900A2C4D6E8.');
  });

  it('deletes a widget it staged, whatever the install did', async () => {
    resign.mockResolvedValue({ path: '/tmp/kroma-wgt-1/KROMA.wgt', staged: true });
    runOk.mockImplementation(async () => 'List of devices attached');

    await expect(installTizen(context())).rejects.toThrow('the TV refused the connection');

    expect(rm).toHaveBeenCalledWith('/tmp/kroma-wgt-1', { recursive: true, force: true });
  });
});

describe('installFailure', () => {
  it('quotes what the tools said when the failure names no certificate', () => {
    const output = ['Transferring the package...', 'error: install failed[118]'].join('\n');

    expect(installFailure(output, 'kroma', null)).toBe(
      'the install failed: Transferring the package... / error: install failed[118]',
    );
  });

  it('says only that it failed when the tools said nothing at all', () => {
    expect(installFailure('', 'kroma', null)).toBe('the install failed');
  });

  it('names the profile whose chain a retail set refused', () => {
    const message = installFailure('error: certificate is invalid', 'kroma', null);

    expect(message).toContain('profile kroma signed it and the set refused that chain.');
    expect(message).toContain('a distributor certificate Samsung issued for its own DUID');
  });

  it('gives the DUID to register when the set said which one it is', () => {
    const message = installFailure('error: certificate is invalid', null, '1900A2C4D6E8');

    expect(message).toContain('The DUID to register is 1900A2C4D6E8.');
  });
});
