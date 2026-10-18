// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { KitProvider } from '#ui/configure';
import { FocusScope } from '#ui/lib/focus-scope';
import { type SurfacePresentation, useSurfacePresentation } from './surface-presentation';

function unscoped(presentation?: SurfacePresentation, surfaces: SurfacePresentation = 'auto') {
  return renderHook(() => useSurfacePresentation(presentation), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(KitProvider, { config: { surfaces }, children }),
  }).result.current;
}

function insideAScope(presentation?: SurfacePresentation) {
  return renderHook(() => useSurfacePresentation(presentation), { wrapper: FocusScope }).result
    .current;
}

describe('where an anchored surface goes', () => {
  it('hangs a panel off the trigger where nothing drives the focus', () => {
    expect(unscoped()).toBe('panel');
  });

  it('opens a dialog where a spatial navigator drives it', () => {
    expect(insideAScope()).toBe('dialog');
  });

  it('takes the shell over the platform', () => {
    expect(unscoped(undefined, 'dialog')).toBe('dialog');
  });

  it('takes the surface over the shell', () => {
    expect(unscoped('panel', 'dialog')).toBe('panel');
  });

  it('hands the question back to the platform when both said `auto`', () => {
    expect(insideAScope('auto')).toBe('dialog');
  });
});
