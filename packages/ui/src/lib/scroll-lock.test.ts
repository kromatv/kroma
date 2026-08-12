// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webDocument } from '#ui/lib/dom';
import { useScrollLock } from './scroll-lock';

vi.mock('#ui/lib/dom', async (original) => {
  const real = await original<typeof import('#ui/lib/dom')>();
  return { webDocument: vi.fn(real.webDocument), webWindow: vi.fn(real.webWindow) };
});

const overflow = () => ({
  root: document.documentElement.style.overflow,
  body: document.body.style.overflow,
});
const padding = () => document.body.style.paddingRight;

function viewport(at: Readonly<{ window: number; page: number }>) {
  Object.defineProperty(window, 'innerWidth', { value: at.window, configurable: true });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: at.page,
    configurable: true,
  });
}

function scroller(at: Readonly<{ top: number; height: number; box: number; overflow?: string }>) {
  const node = document.createElement('div');
  node.style.overflowY = at.overflow ?? 'auto';
  Object.defineProperty(node, 'scrollHeight', { value: at.height, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: at.box, configurable: true });
  Object.defineProperty(node, 'scrollTop', { value: at.top, configurable: true });
  document.body.append(node);
  return node;
}

// jsdom has no TouchEvent, and the guard only ever reads `touches`.
function fire(
  type: string,
  on: Element | Document,
  points: readonly { clientY: number }[],
  cancelable = true,
): Event {
  const event = new Event(type, { bubbles: true, cancelable });
  Object.defineProperty(event, 'touches', { value: points });
  on.dispatchEvent(event);
  return event;
}

/** A finger travelling `by` pixels up the screen, which asks the content under
 *  it to travel the same distance down. */
function drag(on: Element | Document, by: number, cancelable = true): boolean {
  fire('touchstart', on, [{ clientY: 400 }]);
  return fire('touchmove', on, [{ clientY: 400 - by }], cancelable).defaultPrevented;
}

beforeEach(() => {
  viewport({ window: 1024, page: 1024 });
});

afterEach(() => {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
  document.body.replaceChildren();
});

describe('useScrollLock', () => {
  it('locks the page behind an open overlay and gives it back on close', () => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'scroll';
    const view = renderHook(() => useScrollLock(true));
    expect(overflow()).toEqual({ root: 'hidden', body: 'hidden' });
    view.unmount();
    expect(overflow()).toEqual({ root: 'auto', body: 'scroll' });
  });

  it('holds the lock until the LAST of two nested overlays closes', () => {
    const outer = renderHook(() => useScrollLock(true));
    const inner = renderHook(() => useScrollLock(true));
    expect(overflow().root).toBe('hidden');

    inner.unmount();
    expect(overflow().root).toBe('hidden');

    outer.unmount();
    expect(overflow().root).toBe('');
  });

  it('takes no lock while the overlay is closed', () => {
    document.documentElement.style.overflow = 'auto';
    renderHook(() => useScrollLock(false));
    expect(overflow().root).toBe('auto');
  });

  it('does nothing at all where there is no page: the prerender pass', () => {
    vi.mocked(webDocument).mockReturnValueOnce(null);
    document.documentElement.style.overflow = 'auto';
    const view = renderHook(() => useScrollLock(true));
    expect(overflow().root).toBe('auto');
    expect(() => view.unmount()).not.toThrow();
  });
});

describe('the width the vanished scrollbar leaves behind', () => {
  it('is measured and given back, on top of whatever the page already reserved', () => {
    viewport({ window: 1024, page: 1009 });
    document.body.style.paddingRight = '8px';
    const view = renderHook(() => useScrollLock(true));
    expect(padding()).toBe('23px');
    view.unmount();
    expect(padding()).toBe('8px');
  });

  it('is the whole padding where the page reserved none of its own', () => {
    viewport({ window: 1024, page: 1009 });
    const view = renderHook(() => useScrollLock(true));
    expect(padding()).toBe('15px');
    view.unmount();
    expect(padding()).toBe('');
  });

  it('is nothing where the scrollbar took none, as macOS draws it', () => {
    const view = renderHook(() => useScrollLock(true));
    expect(padding()).toBe('');
    view.unmount();
  });
});

describe('the touch a locked page must not answer', () => {
  it('is cancelled when nothing under it can scroll: iOS ignores overflow', () => {
    const view = renderHook(() => useScrollLock(true));
    expect(drag(document.body, 40)).toBe(true);
    expect(drag(document, 40)).toBe(true);
    view.unmount();
  });

  it('is left alone inside the panel that can still take it', () => {
    const view = renderHook(() => useScrollLock(true));
    const panel = scroller({ top: 0, height: 400, box: 100 });
    expect(drag(panel, 40)).toBe(false);
    view.unmount();
  });

  it('is left alone for a node the panel merely contains', () => {
    const view = renderHook(() => useScrollLock(true));
    const panel = scroller({ top: 20, height: 400, box: 100 });
    const row = document.createElement('span');
    panel.append(row);
    expect(drag(row, 40)).toBe(false);
    view.unmount();
  });

  it('is cancelled once that panel has reached the end it was asked to pass', () => {
    const view = renderHook(() => useScrollLock(true));
    const panel = scroller({ top: 300, height: 400, box: 100 });
    expect(drag(panel, 40)).toBe(true);
    expect(drag(panel, -40)).toBe(false);
    view.unmount();
  });

  it('is cancelled at the top of that panel when the finger asks for more', () => {
    const view = renderHook(() => useScrollLock(true));
    const panel = scroller({ top: 0, height: 400, box: 100 });
    expect(drag(panel, -40)).toBe(true);
    view.unmount();
  });

  it('is cancelled over a box that overflows without scrolling', () => {
    const view = renderHook(() => useScrollLock(true));
    const clipped = scroller({ top: 0, height: 400, box: 100, overflow: 'hidden' });
    expect(drag(clipped, 40)).toBe(true);
    view.unmount();
  });

  it('is left alone when it is a pinch, which is a zoom rather than a scroll', () => {
    const view = renderHook(() => useScrollLock(true));
    fire('touchstart', document.body, [{ clientY: 400 }]);
    const pinch = fire('touchmove', document.body, [{ clientY: 300 }, { clientY: 500 }]);
    expect(pinch.defaultPrevented).toBe(false);
    view.unmount();
  });

  it('is left alone when it can no longer be taken back', () => {
    const view = renderHook(() => useScrollLock(true));
    expect(drag(document.body, 40, false)).toBe(false);
    view.unmount();
  });

  it('is cancelled when it carries no finger the guard can read', () => {
    const view = renderHook(() => useScrollLock(true));
    fire('touchstart', document.body, []);
    expect(fire('touchmove', document.body, []).defaultPrevented).toBe(true);
    view.unmount();
  });

  it('is nobody’s business once the page has been given back', () => {
    renderHook(() => useScrollLock(true)).unmount();
    expect(drag(document.body, 40)).toBe(false);
  });
});
