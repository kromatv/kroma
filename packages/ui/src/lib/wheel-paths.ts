// The KROMA chromatic wheel: geometry and palette only, so both the universal
// <Wheel> and the DOM <KromaMark> draw from one source.

// Clockwise from 12 o'clock.
export const KROMA_WHEEL_COLORS = [
  '#F2685C',
  '#F4B642',
  '#5FBF8F',
  '#4F9DE0',
  '#6366F1',
  '#A855F7',
] as const;

// Annular sectors (outer r 44, inner r 15, centre 50,50): the hub is a real hole,
// so the mark sits on any surface with no background-matched fill.
export const KROMA_WHEEL_SEGMENTS = [
  'M50 35 L50 6 A44 44 0 0 1 88 28 L62.99 42.5 A15 15 0 0 0 50 35 Z',
  'M62.99 42.5 L88 28 A44 44 0 0 1 88 72 L62.99 57.5 A15 15 0 0 0 62.99 42.5 Z',
  'M62.99 57.5 L88 72 A44 44 0 0 1 50 94 L50 65 A15 15 0 0 0 62.99 57.5 Z',
  'M50 65 L50 94 A44 44 0 0 1 12 72 L37.01 57.5 A15 15 0 0 0 50 65 Z',
  'M37.01 57.5 L12 72 A44 44 0 0 1 12 28 L37.01 42.5 A15 15 0 0 0 37.01 57.5 Z',
  'M37.01 42.5 L12 28 A44 44 0 0 1 50 6 L50 35 A15 15 0 0 0 37.01 42.5 Z',
] as const;

export type WheelSpin = 'idle' | 'loading';

export const WHEEL_SPIN_MS: Record<WheelSpin, number> = { idle: 9000, loading: 2600 };

/** The outer ring's bounding square, in the segments' own units. */
export const WHEEL_BOUNDS = { origin: 6, size: 88 } as const;

// Cropped to the wheel's bounds, so `size` is the true diameter.
export const WHEEL_VIEWBOX = `${WHEEL_BOUNDS.origin} ${WHEEL_BOUNDS.origin} ${WHEEL_BOUNDS.size} ${WHEEL_BOUNDS.size}`;
