// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './use-reduced-motion';

interface Preference {
  matches: boolean;
  queried: string[];
  announce(): void;
  listeners: number;
}

function preference(matches: boolean): Preference {
  const listeners = new Set<() => void>();
  const state: Preference = {
    matches,
    queried: [],
    announce: () => {
      for (const listen of listeners) listen();
    },
    get listeners() {
      return listeners.size;
    },
  };
  vi.stubGlobal('matchMedia', (query: string) => {
    state.queried.push(query);
    return {
      get matches() {
        return state.matches;
      },
      addEventListener: (_: string, listen: () => void) => listeners.add(listen),
      removeEventListener: (_: string, listen: () => void) => listeners.delete(listen),
    };
  });
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('reads the preference the platform already holds', () => {
    const asked = preference(true);

    const { result } = renderHook(() => useReducedMotion());

    expect(result.current).toBe(true);
    expect(asked.queried).toEqual(['(prefers-reduced-motion: reduce)']);
  });

  it('follows the preference changing while the page is open', () => {
    const asked = preference(false);
    const { result } = renderHook(() => useReducedMotion());

    act(() => {
      asked.matches = true;
      asked.announce();
    });

    expect(result.current).toBe(true);
  });

  it('stops listening once the globe is gone', () => {
    const asked = preference(false);
    const { unmount } = renderHook(() => useReducedMotion());

    unmount();

    expect(asked.listeners).toBe(0);
  });
});
