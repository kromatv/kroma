// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { webWindow } from '#ui/lib/dom';
import { ANCHOR_GAP, placeUnder } from './anchor';

vi.mock('#ui/lib/dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#ui/lib/dom')>();
  return { ...actual, webWindow: vi.fn(actual.webWindow) };
});

// jsdom's viewport, which the clamping is measured against.
const VIEW = { width: 1024, height: 768 };
const EDGE = 12;

function triggerAt(box: { left: number; top: number; width?: number; height?: number }) {
  const width = box.width ?? 200;
  const height = box.height ?? 30;
  const rect = {
    left: box.left,
    top: box.top,
    right: box.left + width,
    bottom: box.top + height,
    width,
    height,
    x: box.left,
    y: box.top,
  };
  const el = document.createElement('button');
  el.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  return el;
}

describe('placeUnder', () => {
  it('hangs the panel under the trigger, left edges aligned', () => {
    const at = placeUnder(triggerAt({ left: 40, top: 100 }), { minWidth: 180, maxHeight: 320 });
    expect(at).toMatchObject({ left: 40, top: 130 + ANCHOR_GAP, width: 180 });
    expect(at.bottom).toBeUndefined();
  });

  it('takes the wider of the trigger and the floor when asked to match', () => {
    const wide = placeUnder(triggerAt({ left: 40, top: 100, width: 300 }), {
      minWidth: 180,
      matchWidth: true,
      maxHeight: 320,
    });
    expect(wide.width).toBe(300);
    const narrow = placeUnder(triggerAt({ left: 40, top: 100, width: 90 }), {
      minWidth: 180,
      matchWidth: true,
      maxHeight: 320,
    });
    expect(narrow.width).toBe(180);
  });

  it('pins a right-aligned panel to the far edge of the trigger', () => {
    const at = placeUnder(triggerAt({ left: 400, top: 100, width: 200 }), {
      minWidth: 180,
      maxHeight: 320,
      align: 'end',
    });
    expect(at.left).toBe(600 - 180);
  });

  it('keeps the panel inside the viewport at both edges', () => {
    const offRight = placeUnder(triggerAt({ left: VIEW.width - 40, top: 100 }), {
      minWidth: 300,
      maxHeight: 320,
    });
    expect(offRight.left).toBe(VIEW.width - 300 - EDGE);
    const offLeft = placeUnder(triggerAt({ left: -80, top: 100 }), {
      minWidth: 300,
      maxHeight: 320,
    });
    expect(offLeft.left).toBe(EDGE);
  });

  it('flips above the trigger when there is no room to breathe below', () => {
    // Bottom-pinned, not top-pinned: a panel shorter than its budget still sits
    // against the trigger instead of floating away from it.
    const at = placeUnder(triggerAt({ left: 40, top: 700 }), { minWidth: 180, maxHeight: 320 });
    expect(at.top).toBeUndefined();
    expect(at.bottom).toBe(VIEW.height - 700 + ANCHOR_GAP);
    expect(at.maxHeight).toBe(320);
  });

  it('stays below when below is cramped but above is worse', () => {
    const at = placeUnder(triggerAt({ left: 40, top: 10, height: 20 }), {
      minWidth: 180,
      maxHeight: 320,
    });
    expect(at.top).toBe(30 + ANCHOR_GAP);
  });

  it('shrinks the height budget to the room it actually has', () => {
    const at = placeUnder(triggerAt({ left: 40, top: 500 }), { minWidth: 180, maxHeight: 320 });
    expect(at.maxHeight).toBe(VIEW.height - 530 - ANCHOR_GAP - EDGE);
  });

  it('never hands back a negative height', () => {
    const at = placeUnder(triggerAt({ left: 40, top: VIEW.height + 200 }), {
      minWidth: 180,
      maxHeight: 320,
    });
    expect(at.maxHeight).toBeGreaterThanOrEqual(0);
  });

  it('offers room to grow only when the caller allows it', () => {
    const fixed = placeUnder(triggerAt({ left: 40, top: 100 }), { minWidth: 180, maxHeight: 320 });
    expect(fixed.maxWidth).toBeUndefined();
    const grows = placeUnder(triggerAt({ left: 40, top: 100 }), {
      minWidth: 180,
      maxHeight: 320,
      grow: true,
    });
    expect(grows.maxWidth).toBe(VIEW.width - 40 - EDGE);
  });

  it('places against the trigger alone when there is no viewport to clamp to', () => {
    // Server render, or a target with no DOM window: the placement still has to
    // be a usable number rather than a crash.
    vi.mocked(webWindow).mockReturnValueOnce(null);
    const at = placeUnder(triggerAt({ left: 40, top: 100 }), { minWidth: 180, maxHeight: 320 });
    expect(at).toEqual({ left: 40, top: 130 + ANCHOR_GAP, width: 180, maxHeight: 320 });
  });
});
