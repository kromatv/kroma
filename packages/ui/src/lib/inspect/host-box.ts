import { hostRect } from './host-rect';
import { childOf, type Fiber, isHost, siblingOf } from './react-fiber';

/** Where a component sits on screen, in the viewport's pixels. */
export type HostBox = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The first host element under a component fiber, depth first, or null. */
export function firstHost(fiber: Fiber): Fiber | null {
  const pending: Fiber[] = [];
  let at: Fiber | null = childOf(fiber);
  while (at) {
    if (isHost(at)) {
      return at;
    }
    const next = siblingOf(at);
    if (next) {
      pending.push(next);
    }
    at = childOf(at) ?? pending.pop() ?? null;
  }
  return null;
}

function num(rect: object, key: string): number {
  const value: unknown = Reflect.get(rect, key);
  return typeof value === 'number' ? value : Number.NaN;
}

/** The box of the first host element under a component fiber, or null. */
export function hostBox(fiber: Fiber): HostBox | null {
  const host = firstHost(fiber);
  const rect = host && hostRect(host);
  if (typeof rect !== 'object' || rect === null) {
    return null;
  }
  const box = {
    x: num(rect, 'x'),
    y: num(rect, 'y'),
    width: num(rect, 'width'),
    height: num(rect, 'height'),
  };
  return Object.values(box).every(Number.isFinite) ? box : null;
}
