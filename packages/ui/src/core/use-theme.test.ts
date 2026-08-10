// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode, useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createTheme, KROMA, setTheme } from './theme';
import { ThemeProvider, useTheme } from './use-theme';

const OCEAN = createTheme({ colors: { accent: '#3FB6F2' } });

afterEach(() => setTheme(KROMA));

describe('useTheme', () => {
  it('reads the active theme and follows a swap', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.colors.accent).toBe(KROMA.colors.accent);
    act(() => setTheme(OCEAN));
    expect(result.current.colors.accent).toBe('#3FB6F2');
  });
});

describe('ThemeProvider', () => {
  const wrap = (theme?: typeof KROMA) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(ThemeProvider, { theme }, children);
    };

  it('applies the theme it was given', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(OCEAN) });
    expect(result.current.colors.accent).toBe('#3FB6F2');
  });

  it('leaves the active theme alone when given none', () => {
    setTheme(OCEAN);
    const { result } = renderHook(() => useTheme(), { wrapper: wrap() });
    expect(result.current.colors.accent).toBe('#3FB6F2');
  });

  it('remounts the subtree on a swap, because styles resolve during render', () => {
    let mounts = 0;
    let unmounts = 0;
    function Child() {
      useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return null;
    }
    renderHook(() => useTheme(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(ThemeProvider, null, children, createElement(Child)),
    });
    expect(mounts).toBe(1);

    act(() => setTheme(OCEAN));
    expect(unmounts).toBe(1);
    expect(mounts).toBe(2);
  });
});
