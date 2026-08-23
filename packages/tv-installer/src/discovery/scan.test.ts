import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identify } from '../modules/identify';
import type { TvModule } from '../modules/module';
import { detailPorts, modules, searchTargets, sweepPorts } from '../modules/registry';
import type { Television } from '../television';
import { arpHosts } from './arp';
import { localSubnets } from './lan';
import { scan, sweepTargets, watch } from './scan';
import { ssdpSearch } from './ssdp';
import { tcpOpen } from './tcp';
import { fetchDeviceDescription } from './upnp';

vi.mock('./arp', () => ({ arpHosts: vi.fn() }));
vi.mock('./ssdp', () => ({ ssdpSearch: vi.fn() }));
vi.mock('./tcp', () => ({ tcpOpen: vi.fn() }));
vi.mock('./upnp', () => ({ fetchDeviceDescription: vi.fn() }));
vi.mock('../modules/identify', () => ({ identify: vi.fn() }));
vi.mock('../modules/registry', () => ({
  detailPorts: vi.fn(),
  modules: vi.fn(),
  searchTargets: vi.fn(),
  sweepPorts: vi.fn(),
}));
vi.mock('./lan', async (original) => ({
  ...(await original<typeof import('./lan')>()),
  localSubnets: vi.fn(),
}));

const television = (host: string, name = 'Salon'): Television => ({
  host,
  platform: 'webos',
  vendor: 'LG',
  name,
  model: 'OLED55C1',
  developerMode: 'on',
  sideloadable: true,
  note: '',
  runtime: null,
});

const tvModule = (sets?: readonly Television[]): TvModule => ({
  id: 'appletv',
  label: 'Apple TV',
  brands: 'Apple',
  package: 'tv.kroma.appletv',
  notReadyHint: '',
  discover: sets ? () => Promise.resolve([...sets]) : undefined,
  tools: () => [],
  sources: () => [],
  resolve: () => Promise.resolve(''),
  install: () => Promise.resolve(),
});

const reply = (host: string) => ({
  host,
  location: `http://${host}:1754/`,
  server: 'WebOS/1.4',
  searchTarget: 'upnp:rootdevice',
});

const device = {
  friendlyName: '[LG] webOS TV',
  manufacturer: 'LG Electronics',
  modelName: 'LG TV',
  modelNumber: 'OLED55C1',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(arpHosts).mockResolvedValue([]);
  vi.mocked(ssdpSearch).mockResolvedValue([]);
  vi.mocked(tcpOpen).mockResolvedValue(false);
  vi.mocked(identify).mockResolvedValue(null);
  vi.mocked(fetchDeviceDescription).mockResolvedValue(null);
  vi.mocked(localSubnets).mockReturnValue([]);
  vi.mocked(modules).mockReturnValue([]);
  vi.mocked(searchTargets).mockReturnValue([]);
  vi.mocked(sweepPorts).mockReturnValue([8001]);
  vi.mocked(detailPorts).mockReturnValue([1926]);
});

afterEach(() => vi.useRealTimers());

describe('scan', () => {
  it('reports a set the moment a host answers on a swept port', async () => {
    const salon = television('10.0.0.5');
    vi.mocked(tcpOpen).mockImplementation((host) => Promise.resolve(host === '10.0.0.5'));
    vi.mocked(identify).mockResolvedValue(salon);
    const found: Television[] = [];

    const sets = await scan({ hosts: ['10.0.0.5', '10.0.0.6'], onFound: (tv) => found.push(tv) });

    expect(sets).toEqual([salon]);
    expect(found).toEqual([salon]);
  });

  it('asks nothing about a host that answered on no port at all', async () => {
    const sets = await scan({ hosts: ['10.0.0.5'] });

    expect(sets).toEqual([]);
    expect(identify).not.toHaveBeenCalled();
  });

  it('adds the detail ports to what it knows about a host that answered', async () => {
    vi.mocked(tcpOpen).mockResolvedValue(true);
    vi.mocked(identify).mockResolvedValue(television('10.0.0.5'));

    await scan({ hosts: ['10.0.0.5'] });

    expect(vi.mocked(identify).mock.calls[0]?.[1]).toEqual(new Set([8001, 1926]));
  });

  it('counts every host it visited as it goes', async () => {
    const progress: number[][] = [];

    await scan({
      hosts: ['10.0.0.5', '10.0.0.6'],
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('visits no host once the signal has aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const sets = await scan({ hosts: ['10.0.0.5'], signal: controller.signal });

    expect(sets).toEqual([]);
    expect(tcpOpen).not.toHaveBeenCalled();
  });

  it('drops a host that answered after the scan was called off', async () => {
    const controller = new AbortController();
    vi.mocked(tcpOpen).mockImplementation(() => {
      controller.abort();
      return Promise.resolve(true);
    });

    const sets = await scan({ hosts: ['10.0.0.5'], signal: controller.signal });

    expect(sets).toEqual([]);
    expect(identify).not.toHaveBeenCalled();
  });

  it('takes a set a module found on its own without probing for it', async () => {
    const salon = television('Salon.coredevice.local');
    vi.mocked(modules).mockReturnValue([tvModule(), tvModule([salon])]);

    expect(await scan()).toEqual([salon]);
    expect(tcpOpen).not.toHaveBeenCalled();
  });

  it('leaves out a set a module found that is not among the hosts asked about', async () => {
    vi.mocked(modules).mockReturnValue([tvModule([television('Salon.coredevice.local')])]);

    expect(await scan({ hosts: ['10.0.0.5'] })).toEqual([]);
  });

  it('identifies a set that answered the SSDP search but no probe', async () => {
    const chambre = television('10.0.0.7', 'Chambre');
    vi.mocked(ssdpSearch).mockResolvedValue([reply('10.0.0.7')]);
    vi.mocked(fetchDeviceDescription).mockResolvedValue(device);
    vi.mocked(identify).mockResolvedValue(chambre);

    expect(await scan({ hosts: ['10.0.0.5'] })).toEqual([chambre]);
    expect(vi.mocked(identify).mock.calls[0]?.[2]).toEqual(device);
  });

  it('leaves out a host whose description says nothing any module recognises', async () => {
    vi.mocked(ssdpSearch).mockResolvedValue([reply('10.0.0.7')]);
    vi.mocked(fetchDeviceDescription).mockResolvedValue(device);

    expect(await scan({ hosts: ['10.0.0.5'] })).toEqual([]);
  });

  it('asks a set that answered every search target for its description once', async () => {
    vi.mocked(ssdpSearch).mockResolvedValue([reply('10.0.0.7'), reply('10.0.0.7')]);

    await scan({ hosts: ['10.0.0.5'] });

    expect(fetchDeviceDescription).toHaveBeenCalledTimes(1);
  });

  it('asks a set again once its description arrives, and keeps one entry for it', async () => {
    vi.mocked(tcpOpen).mockResolvedValue(true);
    vi.mocked(identify)
      .mockResolvedValueOnce(television('10.0.0.7'))
      .mockResolvedValueOnce({ ...television('10.0.0.7'), name: '[LG] OLED55C1' });
    vi.mocked(ssdpSearch).mockResolvedValue([reply('10.0.0.7')]);
    vi.mocked(fetchDeviceDescription).mockResolvedValue(device);

    const sets = await scan({ hosts: ['10.0.0.7'] });

    expect(identify).toHaveBeenLastCalledWith('10.0.0.7', expect.anything(), device);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.name).toBe('[LG] OLED55C1');
  });

  it('orders what it found by address rather than by who answered first', async () => {
    vi.mocked(tcpOpen).mockResolvedValue(true);
    vi.mocked(identify).mockImplementation((host) => Promise.resolve(television(host)));

    const sets = await scan({ hosts: ['10.0.0.30', '10.0.0.5'] });

    expect(sets.map((tv) => tv.host)).toEqual(['10.0.0.5', '10.0.0.30']);
  });
});

describe('watch', () => {
  it('stops as soon as the signal aborts', async () => {
    const controller = new AbortController();
    const rounds: number[] = [];

    await watch({
      hosts: ['10.0.0.5'],
      signal: controller.signal,
      onRound: (round) => {
        rounds.push(round);
        controller.abort();
      },
    });

    expect(rounds).toEqual([1]);
  });

  it('reports a set once, then again only when what it says about itself changed', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const salon = television('10.0.0.5');
    const renamed = television('10.0.0.5', 'Cuisine');
    const seen: string[] = [];
    vi.mocked(tcpOpen).mockResolvedValue(true);
    vi.mocked(identify)
      .mockResolvedValueOnce(salon)
      .mockResolvedValueOnce(salon)
      .mockResolvedValueOnce(renamed);

    const watching = watch({
      hosts: ['10.0.0.5'],
      signal: controller.signal,
      onFound: (tv) => seen.push(tv.name),
    });
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(1500);
    controller.abort();

    expect(seen).toEqual(['Salon', 'Cuisine']);
    expect(await watching).toEqual([renamed]);
  });
});

describe('sweepTargets', () => {
  it('puts the hosts this machine already talked to before the rest of the subnet', async () => {
    vi.mocked(localSubnets).mockReturnValue([
      { iface: 'en0', address: '192.168.1.10', prefix: '192.168.1' },
    ]);
    vi.mocked(arpHosts).mockResolvedValue(['192.168.1.5']);

    const targets = await sweepTargets();

    expect(targets[0]).toBe('192.168.1.5');
    expect(targets).toHaveLength(253);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('leaves out this machine and any address no local subnet holds', async () => {
    vi.mocked(localSubnets).mockReturnValue([
      { iface: 'en0', address: '192.168.1.10', prefix: '192.168.1' },
    ]);
    vi.mocked(arpHosts).mockResolvedValue(['10.0.0.9', '192.168.1.5']);

    const targets = await sweepTargets();

    expect(targets).not.toContain('10.0.0.9');
    expect(targets).not.toContain('192.168.1.10');
  });
});
