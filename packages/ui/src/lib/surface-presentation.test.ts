// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FocusScope } from '#ui/lib/focus-scope';
import {
  type SurfacePresentation,
  setSurfacePresentation,
  useSurfacePresentation,
} from './surface-presentation';

afterEach(() => setSurfacePresentation('auto'));

function unscoped(presentation?: SurfacePresentation) {
  return renderHook(() => useSurfacePresentation(presentation)).result.current;
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
    setSurfacePresentation('dialog');

    expect(unscoped()).toBe('dialog');
  });

  it('takes the surface over the shell', () => {
    setSurfacePresentation('dialog');

    expect(unscoped('panel')).toBe('panel');
  });

  it('hands the question back to the platform when both said `auto`', () => {
    setSurfacePresentation('auto');

    expect(insideAScope('auto')).toBe('dialog');
  });
});
