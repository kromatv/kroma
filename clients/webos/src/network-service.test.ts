import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LunaMessage } from 'webos-service';

const links = vi.hoisted((): { now: Record<string, unknown[] | undefined> } => ({ now: {} }));

vi.mock('node:os', () => ({ networkInterfaces: () => links.now }));

const { connectedLink, registerNetworkService } = await import('./network-service');

const LOOPBACK = { family: 'IPv4', internal: true, address: '127.0.0.1', mac: '00:00:00:00:00:00' };
const V6 = { family: 'IPv6', internal: false, address: 'fe80::1', mac: 'a0:b1:c2:d3:e4:f5' };
const WIFI = { family: 'IPv4', internal: false, address: '192.168.1.40', mac: 'a0:b1:c2:d3:e4:f5' };

function answer(): Record<string, unknown> {
  let said: Record<string, unknown> = {};
  registerNetworkService({
    register: (_method: string, handler: (message: LunaMessage) => void) => {
      handler({
        payload: {},
        respond: (response) => {
          said = response;
        },
      });
    },
  });
  return said;
}

beforeEach(() => {
  links.now = {};
});

describe('the interface a television is connected by', () => {
  it('is the first one that is not the loopback and has an IPv4 address', () => {
    links.now = { lo: [LOOPBACK], wlan0: [V6, WIFI] };

    expect(connectedLink()).toEqual({ address: '192.168.1.40', mac: 'a0:b1:c2:d3:e4:f5' });
  });

  it('is none when the television is on no network', () => {
    links.now = { lo: [LOOPBACK], down: undefined };

    expect(connectedLink()).toBeNull();
  });

  it('is not one whose hardware address the platform hides', () => {
    links.now = { wlan0: [{ ...WIFI, mac: '00:00:00:00:00:00' }] };

    expect(connectedLink()).toBeNull();
  });
});

describe('the network method', () => {
  it('answers with the address and the hardware address', () => {
    links.now = { wlan0: [WIFI] };

    expect(answer()).toEqual({
      returnValue: true,
      address: '192.168.1.40',
      mac: 'a0:b1:c2:d3:e4:f5',
    });
  });

  it('says so when there is nothing to answer with', () => {
    expect(answer()).toEqual({ returnValue: false });
  });
});
