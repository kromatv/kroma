// @vitest-environment jsdom
//
// The react-native-web <Modal> StrictMode repair, both halves.
//
// The repair is one extra render once the modal is mounted, and every part of
// that sentence is load-bearing. It has to fire when `mounted` turns true rather
// than only on first mount, or a dialog that opens later is never repaired. It
// has to fire ONCE - a hook that re-renders on every render is an infinite loop
// in the one component that owns a dialog. And it must not fire while nothing is
// mounted, because then it is a wasted render on every screen that merely COULD
// open a dialog.
//
// The native half is a no-op: React Native's Modal is a platform view, not a DOM
// portal, so a television pays nothing for a browser's bug.

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useModalPortalRepair as useRepairNative } from './modal-portal';
import { useModalPortalRepair as useRepairWeb } from './modal-portal.web';

/** Count renders of the hook's own component - the repair is a re-render of the
 *  Modal's PARENT, which is what re-runs ModalPortal's render. */
function counting(hook: (mounted: boolean) => void) {
  let renders = 0;
  const { rerender, unmount } = renderHook(
    ({ mounted }) => {
      renders++;
      hook(mounted);
    },
    { initialProps: { mounted: false } },
  );
  return { renders: () => renders, rerender, unmount };
}

describe('the web half', () => {
  it('does not re-render while nothing is mounted', () => {
    const c = counting(useRepairWeb);
    // Every screen that could open a dialog calls this; an unconditional repair
    // would cost all of them a second render for nothing.
    expect(c.renders()).toBe(1);
  });

  it('repairs when the modal opens, not only on first mount', () => {
    const c = counting(useRepairWeb);
    const before = c.renders();
    c.rerender({ mounted: true });
    // The open itself, plus the repair render.
    expect(c.renders()).toBe(before + 2);
  });

  it('repairs exactly once per open', () => {
    const c = counting(useRepairWeb);
    c.rerender({ mounted: true });
    const after = c.renders();
    // Still open: the effect does not re-run, so no further renders. A repair
    // that fired on every render would never stop.
    c.rerender({ mounted: true });
    expect(c.renders()).toBe(after + 1);
  });

  it('repairs again the next time it opens', () => {
    const c = counting(useRepairWeb);
    c.rerender({ mounted: true });
    c.rerender({ mounted: false });
    const closed = c.renders();
    c.rerender({ mounted: true });
    // A dialog is opened and closed repeatedly; each open needs its own repair,
    // because each open builds a fresh portal container.
    expect(c.renders()).toBe(closed + 2);
  });

  it('costs nothing on close', () => {
    const c = counting(useRepairWeb);
    c.rerender({ mounted: true });
    const open = c.renders();
    c.rerender({ mounted: false });
    expect(c.renders()).toBe(open + 1);
  });
});

describe('the native half', () => {
  it('never re-renders, whatever the modal does', () => {
    const c = counting(useRepairNative);
    c.rerender({ mounted: true });
    c.rerender({ mounted: false });
    c.rerender({ mounted: true });
    // Three rerenders on top of the mount, and not one extra: nothing to repair.
    expect(c.renders()).toBe(4);
  });

  it('has the same signature, so the caller need not know the platform', () => {
    expect(() => renderHook(() => useRepairNative(true))).not.toThrow();
  });
});
