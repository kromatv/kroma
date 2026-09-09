import { describe, expect, it } from 'vitest';
import { ACTIVE_DAYS, aggregate, counted, FLOOR, floored, SETTLE_DAYS } from './aggregate';
import { row } from './test-support';

const DAY = 86_400;
const NOW = 1_800_000_000;

function settled(overrides: Parameters<typeof row>[0] = {}) {
  return row({ firstSeen: NOW - 30 * DAY, lastSeen: NOW - DAY, ...overrides });
}

describe('counted', () => {
  it('leaves out an install that has not been heard from in a month', () => {
    const rows = [
      settled({ id: 'live' }),
      settled({ id: 'gone', lastSeen: NOW - (ACTIVE_DAYS + 1) * DAY }),
    ];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['live']);
  });

  it('leaves out an install younger than the settling window', () => {
    const rows = [
      settled({ id: 'old' }),
      settled({ id: 'new', firstSeen: NOW - (SETTLE_DAYS - 1) * DAY }),
    ];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['old']);
  });

  it('leaves out a row the nightly sweep flagged', () => {
    const rows = [settled({ id: 'real' }), settled({ id: 'fleet', flagged: true })];

    expect(counted(rows, NOW).map((r) => r.id)).toEqual(['real']);
  });
});

describe('floored', () => {
  it('drops an entry too few installs share', () => {
    const counts = new Map([
      ['common', FLOOR],
      ['rare', FLOOR - 1],
    ]);

    expect(floored(counts)).toEqual([{ key: 'common', n: FLOOR }]);
  });

  it('orders what survives by weight, then by name', () => {
    const counts = new Map([
      ['b', FLOOR],
      ['a', FLOOR],
      ['c', FLOOR + 1],
    ]);

    expect(floored(counts).map((c) => c.key)).toEqual(['c', 'a', 'b']);
  });

  it('keeps a key that looks like a number where its count puts it', () => {
    const counts = new Map([
      ['2', FLOOR],
      ['1.4.2', FLOOR + 3],
    ]);

    expect(floored(counts).map((c) => c.key)).toEqual(['1.4.2', '2']);
  });

  it('counts a key that names something on Object.prototype', () => {
    expect(floored(new Map([['constructor', FLOOR]]))).toEqual([{ key: 'constructor', n: FLOOR }]);
  });
});

describe('aggregate', () => {
  const fleet = (n: number, overrides: Parameters<typeof row>[0] = {}) =>
    Array.from({ length: n }, (_, i) => settled({ id: `id-${i}`, ...overrides }));

  it('counts installs and adds up the devices they serve', () => {
    const result = aggregate(fleet(FLOOR), [], NOW);

    expect(result.instances).toBe(FLOOR);
    expect(result.clients).toEqual({
      tv: FLOOR,
      mobile: 2 * FLOOR,
      desktop: 0,
      total: 3 * FLOOR,
    });
  });

  it('reports the operating system rather than the full build triple', () => {
    const result = aggregate(fleet(FLOOR, { target: 'aarch64-apple-darwin' }), [], NOW);

    expect(result.platforms).toEqual([{ key: 'apple-darwin', n: FLOOR }]);
  });

  it('suppresses a country only one or two installs are in', () => {
    const rows = [...fleet(FLOOR, { country: 'CH' }), settled({ id: 'lone', country: 'NZ' })];

    const result = aggregate(rows, [], NOW);

    expect(result.countries).toEqual([{ key: 'CH', n: FLOOR }]);
    expect(result.instances).toBe(FLOOR + 1);
  });

  it('counts a language and a module once per install that has it', () => {
    const rows = fleet(FLOOR, { locales: ['de-de', 'de-de'], modules: ['tv.kroma.vpn'] });

    const result = aggregate(rows, [], NOW);

    expect(result.locales).toEqual([{ key: 'de-de', n: FLOOR }]);
    expect(result.modules).toEqual([{ key: 'tv.kroma.vpn', n: FLOOR }]);
  });

  it('passes the recorded history through and stamps when it answered', () => {
    const history = [{ day: '2026-08-25', instances: 3, clients: 9 }];

    const result = aggregate([], history, NOW);

    expect(result.history).toEqual(history);
    expect(result.updatedAt).toBe(NOW);
  });
});

describe('aggregate with no floor', () => {
  it('keeps a breakdown a single install has, which the public view suppresses', () => {
    const rows = [settled({ id: 'lone', country: 'NZ', version: '9.9.9' })];

    const publicView = aggregate(rows, [], NOW);
    const adminView = aggregate(rows, [], NOW, 0);

    expect(publicView.countries).toEqual([]);
    expect(adminView.countries).toEqual([{ key: 'NZ', n: 1 }]);
    expect(adminView.versions).toEqual([{ key: '9.9.9', n: 1 }]);
  });
});
