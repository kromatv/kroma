// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIdleCursor } from './use-idle-cursor';

const rule = () => document.getElementById('kroma-player-idle-cursor')?.textContent ?? null;

describe('useIdleCursor', () => {
  it('takes the pointer away while the chrome is away and gives it back with it', () => {
    const view = renderHook(({ hidden }) => useIdleCursor(hidden), {
      initialProps: { hidden: false },
    });

    expect(rule()).toBeNull();

    view.rerender({ hidden: true });
    expect(rule()).toContain('cursor: none !important');

    view.rerender({ hidden: false });
    expect(rule()).toBeNull();
  });

  it('claims the player root and everything under it, so a control keeps no hand', () => {
    renderHook(() => useIdleCursor(true));

    expect(rule()).toContain('#kroma-player, #kroma-player *');
  });

  it('leaves no rule behind when the player unmounts hidden', () => {
    const view = renderHook(() => useIdleCursor(true));

    view.unmount();

    expect(rule()).toBeNull();
  });
});
