import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../shared/run';
import { arpHosts, parseBsdArp, parseLinuxArp, parseWindowsArp } from './arp';

vi.mock('../shared/run', () => ({ run: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const bsd = [
  '? (192.168.1.1) at dc:f5:1b:75:c6:c0 on en0 ifscope [ethernet]',
  '? (192.168.1.107) at 4:e4:b6:5d:38:a0 on en0 ifscope [ethernet]',
  '? (192.168.1.200) at (incomplete) on en0 ifscope [ethernet]',
  '? (192.168.1.107) at 4:e4:b6:5d:38:a0 on en1 ifscope [ethernet]',
  '? (224.0.0.251) at 1:0:5e:0:0:fb on en0 ifscope permanent [ethernet]',
].join('\n');

const linux = [
  'IP address       HW type     Flags       HW address            Mask     Device',
  '192.168.1.1      0x1         0x2         dc:f5:1b:75:c6:c0     *        eth0',
  '192.168.1.107    0x1         0x2         04:e4:b6:5d:38:a0     *        eth0',
  '192.168.1.200    0x1         0x0         00:00:00:00:00:00     *        eth0',
  '192.168.1.107    0x1         0x2         04:e4:b6:5d:38:a0     *        wlan0',
  '192.168.1.50     0x1         0x6         3c:22:fb:1a:2b:3c     *        eth0',
  '',
].join('\n');

const windows = [
  '',
  'Interface: 192.168.1.42 --- 0xb',
  '  Internet Address      Physical Address      Type',
  '  192.168.1.1           dc-f5-1b-75-c6-c0     dynamic   ',
  '  192.168.1.107         04-e4-b6-5d-38-a0     dynamic   ',
  '  192.168.1.200         00-00-00-00-00-00     invalid   ',
  '',
  'Interface : 172.24.80.1 --- 0x2c',
  '  Adresse Internet      Adresse physique      Type',
  '  192.168.1.107         04-e4-b6-5d-38-a0     dynamique ',
  '  172.24.95.255         ff-ff-ff-ff-ff-ff     statique  ',
].join('\r\n');

const running = process.platform;
const on = (platform: string) =>
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });

beforeEach(() => {
  on('darwin');
});

afterEach(() => {
  on(running);
  vi.clearAllMocks();
});

describe('parseBsdArp', () => {
  it('reads the address out of every resolved entry', () => {
    expect(parseBsdArp(bsd)).toContain('192.168.1.1');
    expect(parseBsdArp(bsd)).toContain('192.168.1.107');
  });

  it('leaves out an entry whose lookup never completed', () => {
    expect(parseBsdArp(bsd)).not.toContain('192.168.1.200');
  });

  it('names a host once even when two interfaces know it', () => {
    expect(parseBsdArp(bsd).filter((host) => host === '192.168.1.107')).toHaveLength(1);
  });

  it('answers nothing for an empty table', () => {
    expect(parseBsdArp('')).toEqual([]);
  });
});

describe('parseLinuxArp', () => {
  it('reads every completed entry of the kernel table, once each', () => {
    expect(parseLinuxArp(linux)).toEqual(['192.168.1.1', '192.168.1.107', '192.168.1.50']);
  });

  it('answers nothing for a table with only its header', () => {
    expect(parseLinuxArp(linux.split('\n')[0] ?? '')).toEqual([]);
  });
});

describe('parseWindowsArp', () => {
  it('reads every resolved entry of every interface, in any language, once each', () => {
    expect(parseWindowsArp(windows)).toEqual(['192.168.1.1', '192.168.1.107', '172.24.95.255']);
  });

  it('answers nothing when Windows has no entry to print', () => {
    expect(parseWindowsArp('No ARP Entries Found.\r\n')).toEqual([]);
  });
});

describe('arpHosts', () => {
  it('answers every address the system table already knows', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, output: bsd });

    expect(await arpHosts()).toEqual(['192.168.1.1', '192.168.1.107', '224.0.0.251']);
    expect(run).toHaveBeenCalledWith(['arp', '-an'], expect.anything());
  });

  it('answers nothing when arp refuses to print its table', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, output: bsd });

    expect(await arpHosts()).toEqual([]);
  });

  it('reads the kernel table on Linux, where arp is often not installed', async () => {
    on('linux');
    vi.mocked(readFile).mockResolvedValue(linux);

    expect(await arpHosts()).toEqual(['192.168.1.1', '192.168.1.107', '192.168.1.50']);
    expect(readFile).toHaveBeenCalledWith('/proc/net/arp', 'utf8');
    expect(run).not.toHaveBeenCalled();
  });

  it('asks arp -a on Windows', async () => {
    on('win32');
    vi.mocked(run).mockResolvedValue({ code: 0, output: windows });

    expect(await arpHosts()).toEqual(['192.168.1.1', '192.168.1.107', '172.24.95.255']);
    expect(run).toHaveBeenCalledWith(['arp', '-a'], expect.anything());
  });

  it('answers nothing when arp is not on this machine', async () => {
    vi.mocked(run).mockRejectedValue(new Error('spawn arp ENOENT'));

    expect(await arpHosts()).toEqual([]);
  });

  it('answers nothing when the kernel table cannot be read', async () => {
    on('linux');
    vi.mocked(readFile).mockRejectedValue(new Error('ENOENT: /proc/net/arp'));

    expect(await arpHosts()).toEqual([]);
  });
});
