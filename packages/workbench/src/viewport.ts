// The frames a story can be viewed in, and the arithmetic behind the stage:
// how wide a story is drawn, how far a frame is scaled, and how thick a border
// has to be asked for to come out one pixel after that. `canvas.tsx` draws it.

import type { IconName } from '@kroma/ui/kit';
import { CANVAS, type ColorToken } from '@kroma/ui/tokens';
import type { StoryWidth } from './story';

interface Viewport {
  label: string;
  glyph: IconName;
  // `null` on `fit`: the component at its authored size.
  size: { width: number; height: number } | null;
  rotatable: boolean;
}

// The frames a story can be viewed in; the toolbar menu, the frame and its
// caption all read from here.
const VIEWPORTS: Record<string, Viewport> = {
  fit: { label: 'Fit', glyph: 'frame', size: null, rotatable: false },
  tv: {
    label: 'TV',
    glyph: 'device-tv',
    size: { width: CANVAS.width, height: CANVAS.height },
    rotatable: false,
  },
  phone: {
    label: 'Phone',
    glyph: 'device-mobile',
    size: { width: 390, height: 844 },
    rotatable: true,
  },
  tablet: {
    label: 'Tablet',
    glyph: 'device-ipad',
    size: { width: 834, height: 1112 },
    rotatable: true,
  },
};

type ViewportName = 'fit' | 'tv' | 'phone' | 'tablet';

const SURFACES: ColorToken[] = ['bg', 'surface1', 'surface2'];

// How much casing is drawn around a device frame.
const BEZEL = 10;

function frameSize(
  viewport: ViewportName,
  rotate: boolean,
): { width: number; height: number } | null {
  const size = VIEWPORTS[viewport]?.size;
  if (!size) return null;
  return rotate ? { width: size.height, height: size.width } : size;
}

function canRotate(viewport: ViewportName): boolean {
  return VIEWPORTS[viewport]?.rotatable === true;
}

// A border width that comes out one real pixel after the stage's scale transform, clamped so a
// very small stage does not ask for a 6px border.
function hairline(scale: number): number {
  return Math.min(3, 1 / Math.max(scale, 0.2));
}

// The width to give a story and whether the stage has to scroll to fit it. A story that
// declares a width is never scaled: react-native-web implements `onLayout` with
// `getBoundingClientRect`, which is post-transform, so a self-measuring component inside a
// `scale(0.8)` reads 0.8 of its real width while its children lay out against the full one.
function stageWidth(
  spec: StoryWidth | undefined,
  available: number,
): { width?: number; scroll: boolean } {
  if (spec === undefined) return { scroll: false };
  // Not measured yet (jsdom, a first frame): using `available` would pin the
  // story to zero. The next layout pass has the real number.
  const room = available > 0 ? available : undefined;
  if (typeof spec === 'number') {
    return { width: spec, scroll: room !== undefined && spec > room };
  }
  const { min, max } = spec === 'fill' ? {} : spec;
  if (room === undefined) return { width: min, scroll: false };
  const capped = max === undefined ? room : Math.min(room, max);
  // `min` wins over the room available, and the overflow becomes a scroll.
  const width = min === undefined ? capped : Math.max(capped, min);
  return { width, scroll: width > room };
}

export type { ViewportName };
export { BEZEL, canRotate, frameSize, hairline, SURFACES, stageWidth, VIEWPORTS };
