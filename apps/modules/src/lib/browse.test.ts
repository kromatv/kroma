// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ModuleEntry } from '../catalog';
import { sliceLabel, useModuleBrowse } from './browse';

const entry = (id: string, name = '', description = ''): ModuleEntry => ({
  id,
  name,
  version: '0.1.0',
  description,
  artifacts: [],
  url: null,
  sha256: null,
});

describe('sliceLabel', () => {
  it('names the range only when the page is not the whole set', () => {
    expect(sliceLabel({ first: 1, last: 8, total: 12 })).toBe('1-8 of 12 modules');
    expect(sliceLabel({ first: 9, last: 12, total: 12 })).toBe('9-12 of 12 modules');
    expect(sliceLabel({ first: 1, last: 3, total: 3 })).toBe('3 modules');
    expect(sliceLabel({ first: 1, last: 1, total: 1 })).toBe('1 module');
  });
});

const CATALOG = [
  ...Array.from({ length: 12 }, (_, i) => entry(`tv.kroma.tool${i}`, `Tool ${i}`)),
  entry('tv.kroma.vpn', 'VPN', 'Routes the download engine through a tunnel.'),
];

describe('useModuleBrowse', () => {
  it('opens on the unfiltered first page, which is what the server rendered', () => {
    const { result } = renderHook(() => useModuleBrowse(CATALOG));
    expect(result.current.query).toBe('');
    expect(result.current.page).toBe(1);
    expect(result.current.total).toBe(13);
    expect(result.current.pageCount).toBe(2);
    expect(result.current.items.map((m) => m.id)).toEqual(CATALOG.slice(0, 8).map((m) => m.id));
  });

  it('pages forward through the matched set', () => {
    const { result } = renderHook(() => useModuleBrowse(CATALOG));
    act(() => result.current.goTo(2));
    expect(result.current.page).toBe(2);
    expect(result.current.first).toBe(9);
    expect(result.current.last).toBe(13);
    expect(result.current.items).toHaveLength(5);
  });

  it('clamps a page number to the range that exists', () => {
    const { result } = renderHook(() => useModuleBrowse(CATALOG));
    act(() => result.current.goTo(99));
    expect(result.current.page).toBe(2);
    act(() => result.current.goTo(-1));
    expect(result.current.page).toBe(1);
  });

  it('narrows to the matches and returns to the first page', () => {
    const { result } = renderHook(() => useModuleBrowse(CATALOG));
    act(() => result.current.goTo(2));
    act(() => result.current.search('tunnel'));

    expect(result.current.query).toBe('tunnel');
    expect(result.current.page).toBe(1);
    expect(result.current.items.map((m) => m.id)).toEqual(['tv.kroma.vpn']);
    expect(result.current.total).toBe(1);
  });

  it('shows an empty page for a query nothing matches', () => {
    const { result } = renderHook(() => useModuleBrowse(CATALOG));
    act(() => result.current.search('whisper'));

    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.pageCount).toBe(1);
  });
});
