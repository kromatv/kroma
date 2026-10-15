// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisible } from './use-visible';

type Report = (entries: { isIntersecting: boolean }[]) => void;

interface Watch {
  report: Report;
  observed: Element[];
  stopped: boolean;
}

function observatory(): Watch[] {
  const watches: Watch[] = [];
  vi.stubGlobal('IntersectionObserver', function observer(report: Report) {
    const watch: Watch = { report, observed: [], stopped: false };
    watches.push(watch);
    return {
      observe: (element: Element) => watch.observed.push(element),
      disconnect: () => {
        watch.stopped = true;
      },
    };
  });
  return watches;
}

function onScreen(element: HTMLElement | null) {
  const target = { current: element };
  return renderHook(() => useVisible(target));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVisible', () => {
  it('watches the element and calls it visible until told otherwise', () => {
    const watches = observatory();
    const element = document.createElement('div');

    const { result } = onScreen(element);

    expect(result.current).toBe(true);
    expect(watches[0]?.observed).toEqual([element]);
  });

  it('calls an element scrolled off the page invisible', () => {
    const watches = observatory();
    const { result } = onScreen(document.createElement('div'));

    act(() => watches[0]?.report([{ isIntersecting: false }]));

    expect(result.current).toBe(false);
  });

  it('keeps drawing when the observer reports nothing at all', () => {
    const watches = observatory();
    const { result } = onScreen(document.createElement('div'));

    act(() => watches[0]?.report([]));

    expect(result.current).toBe(true);
  });

  it('watches nothing when the ref holds no element', () => {
    const watches = observatory();

    const { result } = onScreen(null);

    expect(result.current).toBe(true);
    expect(watches).toEqual([]);
  });

  it('stops watching when the globe goes away', () => {
    const watches = observatory();
    const { unmount } = onScreen(document.createElement('div'));

    unmount();

    expect(watches[0]?.stopped).toBe(true);
  });
});
