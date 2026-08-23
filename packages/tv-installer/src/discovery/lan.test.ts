import { networkInterfaces } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { compareHosts, localSubnets, prefixOf, subnetHosts } from './lan';

vi.mock('node:os', () => ({ networkInterfaces: vi.fn() }));

const ipv4 = (address: string, internal = false) => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4' as const,
  mac: '3c:22:fb:1a:2b:3c',
  internal,
  cidr: `${address}/24`,
});

const ipv6 = (address: string) => ({
  address,
  netmask: 'ffff:ffff:ffff:ffff::',
  family: 'IPv6' as const,
  mac: '3c:22:fb:1a:2b:3c',
  internal: false,
  cidr: `${address}/64`,
  scopeid: 6,
});

describe('prefixOf', () => {
  it('keeps the first three octets of a dotted-quad address', () => {
    expect(prefixOf('192.168.1.42')).toBe('192.168.1');
  });

  it('answers nothing for an address that is not dotted-quad IPv4', () => {
    expect(prefixOf('fe80::1c2b:4aff:fe6d:1a30')).toBeNull();
    expect(prefixOf('192.168.1')).toBeNull();
    expect(prefixOf('192.168.1.42.7')).toBeNull();
  });

  it('answers nothing for an octet past 255', () => {
    expect(prefixOf('192.168.1.256')).toBeNull();
    expect(prefixOf('999.1.1.1')).toBeNull();
  });
});

describe('subnetHosts', () => {
  it('covers every addressable host of a /24', () => {
    const hosts = subnetHosts('192.168.1');

    expect(hosts).toHaveLength(254);
    expect(hosts[0]).toBe('192.168.1.1');
    expect(hosts.at(-1)).toBe('192.168.1.254');
  });

  it('leaves out the address this machine already holds', () => {
    const hosts = subnetHosts('192.168.1', '192.168.1.42');

    expect(hosts).toHaveLength(253);
    expect(hosts).not.toContain('192.168.1.42');
  });
});

describe('compareHosts', () => {
  it('orders addresses by octet rather than by digit', () => {
    const hosts = ['192.168.1.31', '192.168.1.5', '192.168.1.107'];

    expect([...hosts].sort(compareHosts)).toEqual(['192.168.1.5', '192.168.1.31', '192.168.1.107']);
  });

  it('puts a set named rather than addressed after every address', () => {
    const hosts = ['Salon.coredevice.local', '192.168.1.31'];

    expect([...hosts].sort(compareHosts)).toEqual(['192.168.1.31', 'Salon.coredevice.local']);
  });

  it('orders an address before a named set whichever way round it is asked', () => {
    expect(compareHosts('192.168.1.31', 'Salon.coredevice.local')).toBeLessThan(0);
    expect(compareHosts('Salon.coredevice.local', '192.168.1.31')).toBeGreaterThan(0);
  });

  it('puts the named set last whichever way round the two are handed over', () => {
    expect(compareHosts('Salon.coredevice.local', '192.168.1.31')).toBeGreaterThan(0);
    expect(compareHosts('192.168.1.31', 'Salon.coredevice.local')).toBeLessThan(0);
  });

  it('orders two named sets against each other by name', () => {
    const hosts = ['Salon.coredevice.local', 'Chambre.coredevice.local'];

    expect([...hosts].sort(compareHosts)).toEqual([
      'Chambre.coredevice.local',
      'Salon.coredevice.local',
    ]);
  });
});

describe('localSubnets', () => {
  it('answers the IPv4 network an interface sits on', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      en0: [ipv6('fe80::1c2b:4aff:fe6d:1a30'), ipv4('192.168.1.10')],
      lo0: [ipv4('127.0.0.1', true)],
    });

    expect(localSubnets()).toEqual([
      { iface: 'en0', address: '192.168.1.10', prefix: '192.168.1' },
    ]);
  });

  it('leaves out the virtual interfaces sitting beside the real one', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      awdl0: [ipv4('169.254.7.7')],
      bridge100: [ipv4('192.168.64.1')],
      en0: [ipv4('192.168.1.10')],
      utun4: [ipv4('10.8.0.2')],
    });

    expect(localSubnets().map((subnet) => subnet.iface)).toEqual(['en0']);
  });

  it('names a network once even when two interfaces sit on it', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      en0: [ipv4('192.168.1.10')],
      en1: [ipv4('192.168.1.11')],
    });

    expect(localSubnets()).toHaveLength(1);
  });

  it('answers nothing on a machine that is on no network', () => {
    vi.mocked(networkInterfaces).mockReturnValue({ en0: undefined });

    expect(localSubnets()).toEqual([]);
  });
});
