import { motion } from '#ui/core/tokens';
import { ease } from '#ui/lib/ease';
import { scaleOf } from './scale-of';
import { type Tween, tweenAt } from './tween';

/**
 * A surface's focus scale, played by the frost loop instead of a CSS
 * transition, so the surface and its frost move in the same frame.
 */
export interface ScaleFollow {
  /** The surface's styles changed: find the scale they ask for and ease to it. */
  retarget(now: number): boolean;
  /** Whether the surface's inline style is still the last one this wrote. */
  ownWrite(): boolean;
  /** Writes this frame's scale; true while still easing. */
  step(now: number): boolean;
  release(): void;
}

export function followScale(surface: HTMLElement): ScaleFollow {
  const style = surface.style;
  style.setProperty('transition-property', 'none');
  let shown = scaleOf(getComputedStyle(surface).transform);
  let tween: Tween | null = null;
  let written = surface.getAttribute('style');

  const write = (value: number | null) => {
    if (value === null) style.removeProperty('transform');
    else style.setProperty('transform', `scale(${value})`);
    written = surface.getAttribute('style');
  };

  return {
    retarget(now) {
      style.removeProperty('transform');
      const to = scaleOf(getComputedStyle(surface).transform);
      if (tween?.to === to) {
        write(shown);
        return true;
      }
      if (to === shown) {
        tween = null;
        write(null);
        return false;
      }
      tween = { from: shown, to, start: now, duration: motion.duration.base };
      write(shown);
      return true;
    },
    ownWrite() {
      return surface.getAttribute('style') === written;
    },
    step(now) {
      if (!tween) return false;
      const { value, done } = tweenAt(tween, now, ease.out.native);
      shown = value;
      if (done) {
        tween = null;
        write(null);
        return false;
      }
      write(value);
      return true;
    },
    release() {
      style.removeProperty('transition-property');
      if (tween) write(null);
    },
  };
}
