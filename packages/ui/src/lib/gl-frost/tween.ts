/** One value easing from `from` to `to`, started at `start` (ms). */
export interface Tween {
  from: number;
  to: number;
  start: number;
  duration: number;
}

/** The tween's value at `now`, and whether it has arrived. */
export function tweenAt(
  tween: Tween,
  now: number,
  easing: (t: number) => number,
): { value: number; done: boolean } {
  const t = tween.duration > 0 ? (now - tween.start) / tween.duration : 1;
  if (t >= 1) return { value: tween.to, done: true };
  const k = easing(Math.max(0, t));
  return { value: tween.from + (tween.to - tween.from) * k, done: false };
}

/** How long a scroll of `distance` px glides: longer for further, within bounds. */
export function glideDuration(distance: number): number {
  return Math.min(450, Math.max(250, 200 + Math.abs(distance) * 0.25));
}
