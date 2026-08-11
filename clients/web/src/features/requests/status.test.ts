import type { RequestStatus } from '@kroma/core';
import { color } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { REQUEST_STATUS_META, requestStatusMeta, seasonsSummary } from './status';

describe('requestStatusMeta', () => {
  it('returns the matching meta for every known status', () => {
    expect(requestStatusMeta('available').color).toBe(color('success'));
    expect(requestStatusMeta('failed').dot).toBe(color('danger'));
    expect(requestStatusMeta('pending').labelKey).toBe('requests.st.pending');
  });

  it('marks the in-flight statuses as pulsing', () => {
    expect(requestStatusMeta('searching').pulse).toBe(true);
    expect(requestStatusMeta('downloading').pulse).toBe(true);
    expect(requestStatusMeta('importing').pulse).toBe(true);
    expect(requestStatusMeta('available').pulse).toBeUndefined();
  });

  it('falls back to the pending meta for an unknown status', () => {
    expect(requestStatusMeta('bogus' as RequestStatus)).toBe(REQUEST_STATUS_META.pending);
  });

  it('every entry carries a label key, color, background and dot', () => {
    for (const meta of Object.values(REQUEST_STATUS_META)) {
      expect(meta.labelKey).toMatch(/^requests\.st\./);
      expect(meta.color).toBeTruthy();
      expect(meta.bg).toBeTruthy();
      expect(meta.dot).toBeTruthy();
    }
  });
});

describe('seasonsSummary', () => {
  it('joins season numbers as "S1, S3"', () => {
    expect(seasonsSummary([1, 3])).toBe('S1, S3');
    expect(seasonsSummary([2])).toBe('S2');
  });

  it('returns null for a movie / whole-show request (no seasons)', () => {
    expect(seasonsSummary(null)).toBeNull();
    expect(seasonsSummary(undefined)).toBeNull();
    expect(seasonsSummary([])).toBeNull();
  });
});
