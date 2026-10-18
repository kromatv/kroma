// @vitest-environment jsdom
import type { ScoredReleaseView } from '@kromatv/client/requests';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useReleaseView } from './use-release-view';

function release(guid: string, score: number | null, seeders: number): ScoredReleaseView {
  return { guid, score, seeders } as ScoredReleaseView;
}

const RELEASES = [release('low', 10, 90), release('high', 50, 5), release('refused', null, 999)];

describe('a release view', () => {
  it('opens on the accepted releases, best score first', () => {
    const { result } = renderHook(() => useReleaseView(RELEASES));

    expect(result.current.tab).toBe('accepted');
    expect(result.current.counts).toEqual({ accepted: 2, refused: 1, all: 3 });
    expect(result.current.rows.map((row) => row.guid)).toEqual(['high', 'low']);
  });

  it('opens on the refused releases when none was accepted', () => {
    const { result } = renderHook(() => useReleaseView([release('refused', null, 1)]));

    expect(result.current.tab).toBe('refused');
  });

  it('follows the tab the reader picks', () => {
    const { result } = renderHook(() => useReleaseView(RELEASES));

    act(() => result.current.setTab('all'));

    expect(result.current.rows.map((row) => row.guid)).toEqual(['high', 'low', 'refused']);
  });

  it('follows the sort the reader picks', () => {
    const { result } = renderHook(() => useReleaseView(RELEASES));

    act(() => result.current.setSort('seeders'));

    expect(result.current.rows.map((row) => row.guid)).toEqual(['low', 'high']);
  });
});
