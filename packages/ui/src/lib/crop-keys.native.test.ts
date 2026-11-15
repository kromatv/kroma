// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResizableKeysOptions } from './seam-keys-types';

const seams = vi.hoisted(() => ({ taken: [] as ResizableKeysOptions[] }));

vi.mock('./seam-keys.hook', () => ({
  useResizableKeys: (options: ResizableKeysOptions) => {
    seams.taken.push(options);
  },
}));

const { useCropKeys } = await import('./crop-keys.hook');

afterEach(() => {
  seams.taken.length = 0;
});

describe('useCropKeys (native)', () => {
  it('holds the remote on both axes and pans along the one that moved', () => {
    const onPan = vi.fn();
    const onRelease = vi.fn();

    renderHook(() => useCropKeys({ held: true, onPan, onZoom: vi.fn(), onRelease }));
    const [across, down] = seams.taken;

    expect(across).toMatchObject({ held: true, orientation: 'horizontal', onRelease });
    expect(down).toMatchObject({ held: true, orientation: 'vertical', onRelease });
    across?.onNudge(-1);
    down?.onNudge(1);
    expect(onPan.mock.calls).toEqual([
      [-1, 0],
      [0, 1],
    ]);
  });
});
