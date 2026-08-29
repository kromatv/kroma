// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { testEngine } from '../testing';
import { setEngine } from './engine';
import { useLocales } from './use-locales';

afterEach(() => {
  setEngine(null);
});

describe('the locales the panel offers', () => {
  it('is empty while no engine is installed', () => {
    expect(renderHook(() => useLocales()).result.current).toEqual([]);
  });

  it('is what the engine answers', () => {
    setEngine(testEngine());

    expect(renderHook(() => useLocales()).result.current).toEqual(['fr', 'en']);
  });

  it('lets go of an engine it did subscribe to', () => {
    let held = 1;
    setEngine(
      testEngine({
        subscribe: () => () => {
          held = 0;
        },
      }),
    );

    renderHook(() => useLocales()).unmount();

    expect(held).toBe(0);
  });

  it('follows an engine that settles its answer after the panel mounts', () => {
    let announce = () => {};
    let codes: readonly string[] = [];
    setEngine(
      testEngine({
        locales: () => codes,
        subscribe: (listener) => {
          announce = listener;
          return () => {};
        },
      }),
    );
    const { result, rerender } = renderHook(() => useLocales());

    codes = ['de'];
    announce();
    rerender();

    expect(result.current).toEqual(['de']);
  });

  it('holds still for an engine with nothing to subscribe to, and unmounts clean', () => {
    setEngine(testEngine({ subscribe: undefined }));
    const { result, rerender, unmount } = renderHook(() => useLocales());

    rerender();
    unmount();

    expect(result.current).toEqual(['fr', 'en']);
  });

  it('offers none on a server, where the engine has rendered nothing yet', () => {
    setEngine(testEngine());
    function Offered() {
      return useLocales().join(',');
    }

    expect(renderToString(<Offered />)).toBe('');
  });
});
