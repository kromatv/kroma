import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run, runOk } from '../../run';
import { requireTool } from '../../toolchain/detect';
import type { InstallContext } from '../module';
import { deviceName, installWebos } from './install';

vi.mock('../../run', () => ({ run: vi.fn(), runOk: vi.fn() }));
vi.mock('../../toolchain/detect', async (original) => ({
  ...(await original<typeof import('../../toolchain/detect')>()),
  requireTool: vi.fn(),
}));
vi.mock('./app-id', () => ({ webosAppId: () => 'tv.kroma.webos' }));

const BIN = '/Users/tester/.bun/bin';

const context = (options: InstallContext['options'] = {}, launch = true): InstallContext => ({
  tv: {
    host: '192.168.1.44',
    platform: 'webos',
    vendor: 'LG',
    name: 'Chambre',
    model: 'OLED55C1',
    developerMode: 'on',
    sideloadable: true,
    note: '',
    runtime: null,
  },
  artifact: '/out/tv.kroma.webos_0.1.33_all.ipk',
  log: () => {},
  launch,
  options,
});

const settings = [
  '-i',
  'host=192.168.1.44',
  '-i',
  'port=9922',
  '-i',
  'username=prisoner',
  '-i',
  'privatekey=kroma-192-168-1-44.pem',
];

const ran = () => vi.mocked(run).mock.calls.map(([command]) => [...command]);
const ranOk = () => vi.mocked(runOk).mock.calls.map(([command]) => [...command]);

beforeEach(() => {
  vi.mocked(requireTool).mockReturnValue(`${BIN}/ares-install`);
  vi.mocked(run).mockResolvedValue({ code: 0, output: '' });
  vi.mocked(runOk).mockResolvedValue('');
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('deviceName', () => {
  it('names the set after its address, in something ares takes as a name', () => {
    expect(deviceName('192.168.1.44')).toBe('kroma-192-168-1-44');
  });
});

describe('installWebos', () => {
  it('adds the set to the ones ares knows, over the Dev Mode port', async () => {
    await installWebos(context());

    expect(ran()[0]).toEqual([`${BIN}/ares-setup-device`, '-a', 'kroma-192-168-1-44', ...settings]);
  });

  it('changes the registration of a set ares already knows', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, output: 'The specified device already exists' });

    await installWebos(context());

    expect(ranOk()).toContainEqual([
      `${BIN}/ares-setup-device`,
      '-m',
      'kroma-192-168-1-44',
      ...settings,
    ]);
  });

  it('registers the passphrase the Dev Mode app shows, then fetches the key', async () => {
    await installWebos(context({ passphrase: 'A1B2C3' }));

    expect(ran()[0]).toContain('passphrase=A1B2C3');
    expect(ran()).toContainEqual([
      `${BIN}/ares-novacom`,
      '--device',
      'kroma-192-168-1-44',
      '--getkey',
    ]);
  });

  it('fetches no key when this computer already holds one', async () => {
    await installWebos(context());

    expect(ran().some((command) => command.includes('--getkey'))).toBe(false);
  });

  it('installs the package on the set it registered', async () => {
    await installWebos(context());

    expect(ranOk()).toContainEqual([
      `${BIN}/ares-install`,
      '/out/tv.kroma.webos_0.1.33_all.ipk',
      '-d',
      'kroma-192-168-1-44',
    ]);
  });

  it('starts the app once the package is on', async () => {
    await installWebos(context());

    expect(ranOk().at(-1)).toEqual([
      `${BIN}/ares-launch`,
      'tv.kroma.webos',
      '-d',
      'kroma-192-168-1-44',
    ]);
  });

  it('leaves the app alone when it was told to install without starting it', async () => {
    await installWebos(context({}, false));

    expect(ranOk().some((command) => command[0]?.endsWith('ares-launch'))).toBe(false);
  });
});
