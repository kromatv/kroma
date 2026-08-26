import { describe, expect, it } from 'vitest';
import { BURST_LIMIT, burstIds, dayOf } from './integrity';
import { row } from './test-support';

const NOW = 1_800_000_000;

describe('burstIds', () => {
  const identical = (n: number, at: number) =>
    Array.from({ length: n }, (_, i) => row({ id: `fleet-${i}`, firstSeen: at }));

  it('names every id in a crowd that arrived identical in the same minute', () => {
    const ids = burstIds(identical(BURST_LIMIT, NOW));

    expect(ids).toHaveLength(BURST_LIMIT);
    expect(ids).toContain('fleet-0');
  });

  it('leaves a crowd alone while it is smaller than the limit', () => {
    expect(burstIds(identical(BURST_LIMIT - 1, NOW))).toEqual([]);
  });

  it('leaves alone installs that arrived together but are not alike', () => {
    const rows = Array.from({ length: BURST_LIMIT }, (_, i) =>
      row({ id: `real-${i}`, firstSeen: NOW, version: `1.${i}.0` }),
    );

    expect(burstIds(rows)).toEqual([]);
  });

  it('leaves alone identical installs that arrived minutes apart', () => {
    const rows = Array.from({ length: BURST_LIMIT }, (_, i) =>
      row({ id: `real-${i}`, firstSeen: NOW + i * 120 }),
    );

    expect(burstIds(rows)).toEqual([]);
  });

  it('does not name a row that is already flagged', () => {
    const rows = identical(BURST_LIMIT, NOW).map((r) => ({ ...r, flagged: true }));

    expect(burstIds(rows)).toEqual([]);
  });
});

describe('dayOf', () => {
  it('names the UTC day a moment falls in', () => {
    expect(dayOf(Date.UTC(2026, 7, 26, 23, 59) / 1000)).toBe('2026-08-26');
    expect(dayOf(Date.UTC(2026, 7, 27, 0, 1) / 1000)).toBe('2026-08-27');
  });
});
