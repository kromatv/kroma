// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ANCHOR_GAP } from './anchor';
import {
  PANEL_SHELL,
  useActiveDescendant,
  useAnchoredPlacement,
  useTriggerFocus,
  useTriggerKeys,
} from './anchored-panel';

function nativeView(box: { left: number; top: number; width: number; height: number }) {
  return {
    focus: vi.fn(),
    measureInWindow: (into: (x: number, y: number, width: number, height: number) => void) =>
      into(box.left, box.top, box.width, box.height),
  };
}

const TRIGGER = { left: 40, top: 100, width: 200, height: 30 };

describe('an anchored panel under Metro resolution', () => {
  it('rides the screen with absolute, the closest thing React Native has to fixed', () => {
    expect(PANEL_SHELL.position).toBe('absolute');
  });

  it('places the panel from measureInWindow', () => {
    const anchor = { current: nativeView(TRIGGER) };

    const { result } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );

    expect(result.current).toMatchObject({ left: 40, top: 130 + ANCHOR_GAP, width: 180 });
  });

  it('focuses the trigger through the handle the view exposes', () => {
    const view = nativeView(TRIGGER);

    renderHook(() => useTriggerFocus({ current: view }));

    expect(view.focus).toHaveBeenCalledTimes(1);
  });

  it('stands down from the aria wiring a view cannot carry', () => {
    const anchor = { current: nativeView(TRIGGER) };

    const wire = () => {
      renderHook(() =>
        useTriggerKeys(anchor, { listId: 'panel-list', haspopup: 'listbox', onKeyDown: vi.fn() }),
      );
      renderHook(() => useActiveDescendant(anchor, 'panel-0'));
    };

    expect(wire).not.toThrow();
  });
});
