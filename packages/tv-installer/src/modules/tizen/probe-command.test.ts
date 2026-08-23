import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeCommand } from './probe-command';

const { connect, exitAfter } = vi.hoisted(() => ({
  connect: vi.fn(async (_host: string): Promise<unknown> => null),
  exitAfter: vi.fn((work: number | Promise<number>) => work),
}));
vi.mock('./sdb', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  connect,
}));
vi.mock('../../exit-after', () => ({ exitAfter }));

const capability = vi.fn(async (): Promise<Record<string, string>> => ({}));
const close = vi.fn();

const device = { banner: 'sdbd 4.2.19', capability, close };

const probe = (host: string) =>
  (probeCommand.run as (given: { args: { host: string } }) => Promise<number>)({ args: { host } });

const printed: string[] = [];
const failed: string[] = [];

beforeEach(() => {
  printed.length = 0;
  failed.length = 0;
  vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
  vi.spyOn(console, 'error').mockImplementation((line: string) => void failed.push(line));
  connect.mockReset();
  capability.mockReset();
  close.mockReset();
  connect.mockResolvedValue(device);
  capability.mockResolvedValue({ platform_version: '6.5', model_name: 'UE50AU7172' });
});

describe('probeCommand', () => {
  it('prints the banner the set answered with', async () => {
    await probe('192.168.1.31');

    expect(printed[0]).toContain('banner');
    expect(printed[0]).toContain('sdbd 4.2.19');
  });

  it('prints the capabilities that say what the set is', async () => {
    await probe('192.168.1.31');

    expect(printed.join('\n')).toContain('platform_version');
    expect(printed.join('\n')).toContain('6.5');
    expect(printed.join('\n')).toContain('UE50AU7172');
  });

  it('names the rest of what the set answered on one line', async () => {
    capability.mockResolvedValue({
      platform_version: '6.5',
      cpu_arch: 'armv7',
      usbproto_version: '1.0',
    });

    await probe('192.168.1.31');

    expect(printed.at(-1)).toContain('also');
    expect(printed.at(-1)).toContain('cpu_arch, usbproto_version');
  });

  it('closes the connection whatever the set answered', async () => {
    capability.mockRejectedValue(new Error('the stream closed'));

    await expect(probe('192.168.1.31')).rejects.toThrow('the stream closed');

    expect(close).toHaveBeenCalledOnce();
  });

  it('says what a set that never answered on the bridge port needs', async () => {
    connect.mockRejectedValue(new Error('connect ECONNREFUSED 192.168.1.31:26101'));

    const code = await probe('192.168.1.31');

    expect(code).toBe(1);
    expect(failed[0]).toBe(
      'connect ECONNREFUSED 192.168.1.31:26101. Nothing answered on 26101: developer mode has to be on, naming this computer as the host PC, and the set rebooted since.',
    );
  });

  it('answers a success once it has said what the set is', async () => {
    expect(await probe('192.168.1.31')).toBe(0);
  });
});
