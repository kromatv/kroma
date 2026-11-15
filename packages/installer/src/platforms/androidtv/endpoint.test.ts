import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mdnsPort } from '../../discovery/mdns';
import { tcpOpen } from '../../discovery/tcp';
import { adbEndpoint } from './endpoint';

vi.mock('../../discovery/mdns', () => ({ mdnsPort: vi.fn() }));
vi.mock('../../discovery/tcp', () => ({ tcpOpen: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(tcpOpen).mockResolvedValue(false);
  vi.mocked(mdnsPort).mockResolvedValue(null);
});

describe('adbEndpoint', () => {
  it('answers port 5555 for a set that holds it open, without asking the network', async () => {
    vi.mocked(tcpOpen).mockResolvedValue(true);

    expect(await adbEndpoint('192.168.1.34')).toEqual({ port: 5555, wireless: false });
    expect(mdnsPort).not.toHaveBeenCalled();
  });

  it('answers the port a set on Wireless debugging advertises', async () => {
    vi.mocked(mdnsPort).mockResolvedValue(35221);

    expect(await adbEndpoint('192.168.1.78')).toEqual({ port: 35221, wireless: true });
    expect(vi.mocked(mdnsPort).mock.calls[0]?.slice(0, 2)).toEqual([
      '192.168.1.78',
      '_adb-tls-connect._tcp',
    ]);
  });

  it('answers nothing for a set that offers neither', async () => {
    expect(await adbEndpoint('192.168.1.78')).toBeNull();
  });
});
