// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useModalPortalRepair as useRepairNative } from './modal-portal';
import { useModalPortalRepair as useRepairWeb } from './modal-portal.web';

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
    c.rerender({ mounted: true });
    expect(c.renders()).toBe(after + 1);
  });

  it('repairs again the next time it opens', () => {
    const c = counting(useRepairWeb);
    c.rerender({ mounted: true });
    c.rerender({ mounted: false });
    const closed = c.renders();
    c.rerender({ mounted: true });
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
    // Three rerenders on top of the mount, and not one extra.
    expect(c.renders()).toBe(4);
  });

  it('has the same signature, so the caller need not know the platform', () => {
    expect(() => renderHook(() => useRepairNative(true))).not.toThrow();
  });
});
