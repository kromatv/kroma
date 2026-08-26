// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useActiveDescendant,
  useAnchoredPlacement,
  useTriggerFocus,
  useTriggerKeys,
} from './anchored-panel';

describe('useTriggerFocus', () => {
  it('focuses the trigger while the panel lives and hands focus back on close', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const focus = vi.spyOn(trigger, 'focus');
    const { unmount } = renderHook(() => useTriggerFocus({ current: trigger }));
    expect(focus).toHaveBeenCalledTimes(1);
    unmount();
    expect(focus).toHaveBeenCalledTimes(2);
    trigger.remove();
  });

  it('does not throw when there is no trigger yet', () => {
    expect(() => renderHook(() => useTriggerFocus({ current: null }))).not.toThrow();
  });
});

describe('wiring the trigger to a panel it does not contain', () => {
  it('sends the trigger keys to the panel keyboard, and says what it opens', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const onKeyDown = vi.fn();
    const { unmount } = renderHook(() =>
      useTriggerKeys({ current: trigger }, { listId: 'panel-list', haspopup: 'menu', onKeyDown }),
    );
    expect(trigger.getAttribute('aria-controls')).toBe('panel-list');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown.mock.calls[0]?.[0].nativeEvent.key).toBe('ArrowDown');

    unmount();
    expect(trigger.getAttribute('aria-controls')).toBeNull();
    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    trigger.remove();
  });

  it('names the active row on the trigger, and drops the name with the panel', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const { rerender, unmount } = renderHook(
      (rowId: string) => useActiveDescendant({ current: trigger }, rowId),
      { initialProps: 'panel-0' },
    );
    expect(trigger.getAttribute('aria-activedescendant')).toBe('panel-0');
    rerender('panel-2');
    expect(trigger.getAttribute('aria-activedescendant')).toBe('panel-2');
    unmount();
    expect(trigger.getAttribute('aria-activedescendant')).toBeNull();
    trigger.remove();
  });

  it('both stand down when the trigger has not attached yet', () => {
    const onKeyDown = vi.fn();
    expect(() =>
      renderHook(() =>
        useTriggerKeys({ current: null }, { listId: 'x', haspopup: 'menu', onKeyDown }),
      ),
    ).not.toThrow();
    expect(() => renderHook(() => useActiveDescendant({ current: null }, 'x-0'))).not.toThrow();
  });
});

describe('useAnchoredPlacement', () => {
  const rect = { left: 40, right: 240, top: 100, bottom: 130, width: 200, height: 30 };

  function trigger() {
    const el = document.createElement('button');
    el.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => rect });
    return el;
  }

  const anchorTo = (el: HTMLElement | null) => ({ current: el });

  it('measures before paint, so the panel never flashes at the origin', () => {
    const anchor = anchorTo(trigger());
    const { result } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    expect(result.current).toMatchObject({ left: 40, top: rect.bottom + 6 });
  });

  it('stays null when the anchor is not a measurable element', () => {
    const anchor = anchorTo(null);
    const { result } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    expect(result.current).toBeNull();
  });

  it('re-places on resize and on a scroll in any container', () => {
    const el = trigger();
    let top = 100;
    el.getBoundingClientRect = () =>
      ({ ...rect, top, bottom: top + 30, toJSON: () => rect }) as DOMRect;
    const anchor = anchorTo(el);
    // Queued, never called inline: the hook assigns the frame id AFTER the
    // callback returns, so a synchronous rAF would leave its "a frame is
    // already booked" flag set and swallow every later event.
    const queued: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => queued.push(cb));
    const flush = () =>
      act(() => {
        for (const cb of queued.splice(0)) cb(0);
      });
    const { result } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    expect(result.current?.top).toBe(136);

    top = 300;
    act(() => void window.dispatchEvent(new Event('resize')));
    flush();
    expect(result.current?.top).toBe(336);

    top = 420;
    act(() => void window.dispatchEvent(new Event('scroll')));
    flush();
    expect(result.current?.top).toBe(456);
    raf.mockRestore();
  });

  it('coalesces a burst of scrolls into one measure per frame', () => {
    const anchor = anchorTo(trigger());
    const queued: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        queued.push(cb);
        return queued.length;
      });
    renderHook(() => useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }));
    act(() => {
      for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('scroll'));
    });
    expect(queued).toHaveLength(1);
    raf.mockRestore();
  });

  it('stops listening once the panel is gone', () => {
    const anchor = anchorTo(trigger());
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    unmount();
    const events = remove.mock.calls.map((c) => c[0]);
    expect(events).toContain('resize');
    expect(events).toContain('scroll');
    remove.mockRestore();
  });

  it('cancels a frame still queued when it unmounts', () => {
    const anchor = anchorTo(trigger());
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
    const { unmount } = renderHook(() =>
      useAnchoredPlacement(anchor, { minWidth: 180, maxHeight: 320 }),
    );
    act(() => void window.dispatchEvent(new Event('scroll')));
    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
    raf.mockRestore();
    cancel.mockRestore();
  });
});
