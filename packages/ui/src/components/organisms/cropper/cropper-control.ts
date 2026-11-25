import { defineControl, type ReasonOf, typed } from '#ui/lib/control';
import {
  CROP_IDENTITY,
  type CropBounds,
  type CropTransform,
  clampTransform,
  type PixelSize,
  turn,
  zoomTo,
} from '#ui/lib/crop-geometry';

type Placing = CropBounds & { readonly value: CropTransform; readonly covering: PixelSize };

function sameTransform(a: CropTransform, b: CropTransform): boolean {
  return a.zoom === b.zoom && a.x === b.x && a.y === b.y && a.rotation === b.rotation;
}

const placed = (now: Placing) => clampTransform(now.covering, now.value, now);

function place(now: Placing, next: CropTransform): { value?: CropTransform } {
  const clamped = clampTransform(now.covering, next, now);
  return sameTransform(clamped, placed(now)) ? {} : { value: clamped };
}

function panned(now: Placing, x: number, y: number) {
  const from = placed(now);
  return place(now, { ...from, x: from.x + x, y: from.y + y });
}

function zoomed(now: Placing, delta: number) {
  const from = placed(now);
  return place(now, zoomTo(from, from.zoom + delta, now));
}

function rotated(now: Placing, direction: 'left' | 'right') {
  const from = placed(now);
  return place(now, { ...from, rotation: turn(from.rotation, direction) });
}

/** Where a picture sits behind the cropper's frame. Every action clamps what
 *  it writes against `covering`, the size the frame has to stay covered by. */
export const cropperControl = defineControl('cropper', {
  state: { value: CROP_IDENTITY },
  options: {
    covering: typed<PixelSize>({ width: 1, height: 1 }),
    aspect: 1,
    minZoom: 1,
    maxZoom: 3,
  },
  actions: {
    setTransform: (now, next: CropTransform) => place(now, next),
    panBy: (now, x: number, y: number) => panned(now, x, y),
    zoomBy: (now, delta: number) => zoomed(now, delta),
    rotate: (now, direction: 'left' | 'right') => rotated(now, direction),
    reset: (now) => place(now, CROP_IDENTITY),
  },
  reasons: [],
});

/** Why the transform moved: the action's name, or `set`. */
export type CropperReason = ReasonOf<typeof cropperControl>;
