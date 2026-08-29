// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Origin } from './origin';
import { useOrigin } from './use-origin';

const AT: Origin = {
  url: '/src/who.tsx',
  line: 59,
  column: 8,
  file: '/repo/src/who.tsx',
  source: true,
};

describe('reading where a string is written', () => {
  it('names the file and line a person would read', () => {
    const { result } = renderHook(() => useOrigin(AT));

    expect(result.current).toEqual({ label: 'who.tsx:59', file: '/repo/src/who.tsx:59:8' });
  });

  it('has nothing to say about a string with no origin', () => {
    const { result } = renderHook(() => useOrigin(null));

    expect(result.current).toBeNull();
  });
});
