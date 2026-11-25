// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ControlEngineProvider, useProvidedControlEngine } from './control-context';
import { createControlEngine } from './control-engine';

describe('the engine a provider hands down', () => {
  it('is its own at the root, and the same one on every render', () => {
    const { result, rerender } = renderHook(() => useProvidedControlEngine());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
    expect(first.controls()).toEqual([]);
  });

  it('is the engine of the provider above it', () => {
    const above = createControlEngine();
    const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
      <ControlEngineProvider value={above}>{children}</ControlEngineProvider>
    );

    const { result } = renderHook(() => useProvidedControlEngine(), { wrapper });

    expect(result.current).toBe(above);
  });
});
