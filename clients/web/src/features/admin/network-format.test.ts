import { describe, expect, it } from 'vitest';
import { destination, flowDuration, flowVolume } from '#web/features/admin/network-format';

const fr = {
  decimal: (n: number, digits = 1) =>
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n),
  bytes: (bytes: number) => `${bytes} o`,
};

describe('how long a connection lasted', () => {
  it.each([
    [0, '0 ms'],
    [238, '238 ms'],
    [999, '999 ms'],
    [1000, '1,0 s'],
    [1450, '1,5 s'],
    [59_940, '59,9 s'],
    [60_000, '1 min'],
    [125_000, '2 min 5 s'],
    [119_700, '2 min'],
    [3_600_000, '60 min'],
  ])('reads %d ms as %j', (ms, text) => {
    expect(flowDuration(ms, fr)).toBe(text);
  });

  it('rounds a fraction of a millisecond to a whole one', () => {
    expect(flowDuration(0.4, fr)).toBe('0 ms');
  });
});

describe('what a connection carried', () => {
  it('reads both directions, received first', () => {
    expect(flowVolume({ bytesIn: 2048, bytesOut: 12 }, fr)).toBe('2048 o / 12 o');
  });

  it('reads nothing carried as a dash', () => {
    expect(flowVolume({ bytesIn: 0, bytesOut: 0 }, fr)).toBe('-');
  });
});

describe('where a connection went', () => {
  it('joins a name and its port', () => {
    expect(destination('api.themoviedb.org', 443)).toBe('api.themoviedb.org:443');
  });

  it('brackets an IPv6 address so its port stays readable', () => {
    expect(destination('2001:db8::1', 51413)).toBe('[2001:db8::1]:51413');
  });
});
