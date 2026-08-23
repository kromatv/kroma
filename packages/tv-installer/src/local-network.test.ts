import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arpHosts } from './discovery/arp';
import { localSubnets } from './discovery/lan';
import { connect } from './discovery/tcp';
import {
  askForLocalNetwork,
  localNetworkBlocked,
  mdnsQuery,
  openPrivacySettings,
  PRIVACY_PANE,
  responsibleApp,
} from './local-network';
import { run } from './run';

vi.mock('./discovery/arp', () => ({ arpHosts: vi.fn() }));
vi.mock('./discovery/tcp', () => ({ connect: vi.fn() }));
vi.mock('./run', () => ({ run: vi.fn() }));
vi.mock('./discovery/lan', async (original) => ({
  ...(await original<typeof import('./discovery/lan')>()),
  localSubnets: vi.fn(),
}));

const socket = vi.hoisted(() => ({
  bind: vi.fn(),
  on: vi.fn(),
  setMulticastInterface: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
}));

vi.mock('node:dgram', () => ({ createSocket: vi.fn(() => socket) }));

const realPlatform = process.platform;

const onPlatform = (platform: NodeJS.Platform) => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
};

const home = { iface: 'en0', address: '192.168.1.10', prefix: '192.168.1' };

const labelsOf = (query: Buffer): string[] => {
  const labels: string[] = [];
  for (let at = 12; query[at]; ) {
    const length = Number(query[at]);
    labels.push(query.subarray(at + 1, at + 1 + length).toString('ascii'));
    at += length + 1;
  }
  return labels;
};

beforeEach(() => {
  vi.resetAllMocks();
  onPlatform('darwin');
  socket.bind.mockImplementation((ready: () => void) => ready());
  socket.send.mockImplementation((_query, _port, _group, sent?: () => void) => sent?.());
  vi.mocked(arpHosts).mockResolvedValue([]);
  vi.mocked(localSubnets).mockReturnValue([home]);
  vi.mocked(connect).mockResolvedValue({ outcome: 'timeout', ms: 600 });
  vi.mocked(run).mockResolvedValue({ code: 0, output: '' });
});

afterEach(() => {
  onPlatform(realPlatform);
  vi.useRealTimers();
});

describe('localNetworkBlocked', () => {
  it('reads a refusal too fast to be the network as the permission being denied', async () => {
    vi.mocked(connect).mockResolvedValue({ outcome: 'refused', ms: 3 });

    expect(await localNetworkBlocked()).toBe(true);
  });

  it('reads a refusal at network speed as a set that really refused', async () => {
    vi.mocked(connect).mockResolvedValue({ outcome: 'refused', ms: 250 });

    expect(await localNetworkBlocked()).toBe(false);
  });

  it('reads silence at the probed address as nobody home', async () => {
    expect(await localNetworkBlocked()).toBe(false);
  });

  it('probes only addresses this machine has never talked to', async () => {
    vi.mocked(arpHosts).mockResolvedValue(['192.168.1.253']);

    await localNetworkBlocked();

    expect(vi.mocked(connect).mock.calls.map(([host]) => host)).toEqual([
      '192.168.1.252',
      '192.168.1.251',
    ]);
  });

  it('answers no when the machine sits on no network to be refused', async () => {
    vi.mocked(localSubnets).mockReturnValue([]);

    expect(await localNetworkBlocked()).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('answers no anywhere the permission does not exist', async () => {
    onPlatform('linux');

    expect(await localNetworkBlocked()).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('responsibleApp', () => {
  it('names the application bundle this process runs under', async () => {
    vi.mocked(run).mockResolvedValue({
      code: 0,
      output: '  501 /Applications/Ghostty.app/Contents/MacOS/ghostty',
    });

    expect(await responsibleApp()).toBe('Ghostty');
  });

  it('walks up the process tree until it reaches an application', async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({ code: 0, output: '  501 /bin/zsh' })
      .mockResolvedValueOnce({
        code: 0,
        output: '  1 /Applications/iTerm.app/Contents/MacOS/iTerm2',
      });

    expect(await responsibleApp()).toBe('iTerm');
  });

  it('answers nothing when ps prints a line it cannot read', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: 'ps: no such process' });

    expect(await responsibleApp()).toBeNull();
  });

  it('answers nothing when ps refuses to answer', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, output: '' });

    expect(await responsibleApp()).toBeNull();
  });

  it('gives up after twelve generations of shells', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: '  99 /bin/zsh' });

    expect(await responsibleApp()).toBeNull();
    expect(run).toHaveBeenCalledTimes(12);
  });

  it('answers nothing anywhere macOS is not what owns the process', async () => {
    onPlatform('linux');

    expect(await responsibleApp()).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('openPrivacySettings', () => {
  it('opens the Local Network pane and says the system took it', async () => {
    expect(await openPrivacySettings()).toBe(true);
    expect(vi.mocked(run).mock.calls[0]?.[0]).toEqual(['open', PRIVACY_PANE]);
  });

  it('says nothing opened when the system refuses', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, output: '' });

    expect(await openPrivacySettings()).toBe(false);
  });
});

describe('mdnsQuery', () => {
  it('encodes the name as one length-prefixed label per dotted part', () => {
    expect(labelsOf(mdnsQuery('_services._dns-sd._udp.local'))).toEqual([
      '_services',
      '_dns-sd',
      '_udp',
      'local',
    ]);
  });

  it('asks one PTR question of the internet class', () => {
    const query = mdnsQuery('_services._dns-sd._udp.local');

    expect(query.readUInt16BE(4)).toBe(1);
    expect(query.readUInt16BE(query.length - 4)).toBe(12);
    expect(query.readUInt16BE(query.length - 2)).toBe(1);
  });

  it('carries no id, no flags and no answers of its own', () => {
    const query = mdnsQuery('local');

    expect([...query.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...query.subarray(6, 12)]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('askForLocalNetwork', () => {
  it('multicasts the query out of every interface, then closes the socket', async () => {
    vi.useFakeTimers();
    vi.mocked(localSubnets).mockReturnValue([
      home,
      { iface: 'en1', address: '10.0.0.2', prefix: '10.0.0' },
    ]);

    const asking = askForLocalNetwork();
    await vi.advanceTimersByTimeAsync(300);
    await asking;

    expect(socket.setMulticastInterface.mock.calls.flat()).toEqual(['192.168.1.10', '10.0.0.2']);
    expect(socket.send.mock.calls.map(([, port, group]) => [port, group])).toEqual([
      [5353, '224.0.0.251'],
      [5353, '224.0.0.251'],
    ]);
    expect(socket.close).toHaveBeenCalled();
  });

  it('sends the same question it encodes for the link', async () => {
    vi.useFakeTimers();

    const asking = askForLocalNetwork();
    await vi.advanceTimersByTimeAsync(300);
    await asking;

    expect(socket.send.mock.calls[0]?.[0]).toEqual(mdnsQuery('_services._dns-sd._udp.local'));
  });

  it('skips an interface the socket refuses to multicast on', async () => {
    vi.useFakeTimers();
    socket.setMulticastInterface.mockImplementation(() => {
      throw new Error('EADDRNOTAVAIL');
    });

    const asking = askForLocalNetwork();
    await vi.advanceTimersByTimeAsync(300);
    await asking;

    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
  });

  it('swallows an error the socket raises rather than letting it throw', async () => {
    vi.useFakeTimers();

    const asking = askForLocalNetwork();
    await vi.advanceTimersByTimeAsync(300);
    await asking;
    const raised = socket.on.mock.calls.find(([event]) => event === 'error')?.[1];

    expect(() => raised(new Error('ENETUNREACH'))).not.toThrow();
  });

  it('opens no socket when the machine sits on no network', async () => {
    vi.mocked(localSubnets).mockReturnValue([]);

    await askForLocalNetwork();

    expect(socket.bind).not.toHaveBeenCalled();
  });

  it('asks nothing anywhere the permission does not exist', async () => {
    onPlatform('linux');

    await askForLocalNetwork();

    expect(socket.bind).not.toHaveBeenCalled();
  });
});
