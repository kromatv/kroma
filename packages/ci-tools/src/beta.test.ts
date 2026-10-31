import { describe, expect, it } from 'vitest';
import { newestPromotable, parseRecorded, verdict } from './beta';

describe('newestPromotable', () => {
  it('stops at the first run whose gate passed', async () => {
    const gates: Record<number, string | null> = { 30: 'skipped', 20: 'success', 10: 'success' };
    const asked: number[] = [];

    const picked = await newestPromotable([30, 20, 10], async (id) => {
      asked.push(id);
      return gates[id] ?? null;
    });

    expect(picked).toBe(20);
    expect(asked).toEqual([30, 20]);
  });

  it('finds nothing when no gate passed', async () => {
    expect(await newestPromotable([3, 2], async () => 'failure')).toBeUndefined();
  });
});

describe('parseRecorded', () => {
  it('reads the version and the build number', () => {
    expect(parseRecorded('0.1.39\n', '3592672\n')).toEqual({ version: '0.1.39', build: 3592672 });
  });

  it('keeps a dispatch suffix on the version', () => {
    expect(parseRecorded('0.1.39-rc1', undefined)).toEqual({
      version: '0.1.39-rc1',
      build: undefined,
    });
  });

  it('refuses a version that would not name a file', () => {
    expect(() => parseRecorded('0.1.39; rm -rf /', '1')).toThrow();
  });
});

describe('verdict', () => {
  it('ships a build newer than any App Store Connect holds', () => {
    expect(verdict(3592700, 3592672)).toEqual({ ship: true });
    expect(verdict(3592700, undefined)).toEqual({ ship: true });
  });

  it('holds a build the stores already have', () => {
    const decision = verdict(3592672, 3592672);

    expect(decision.ship).toBe(false);
  });

  it('holds a build that a later promotion already passed', () => {
    expect(verdict(3592600, 3592672).ship).toBe(false);
  });

  it('holds a run that recorded no build number', () => {
    expect(verdict(undefined, 3592672).ship).toBe(false);
  });
});
