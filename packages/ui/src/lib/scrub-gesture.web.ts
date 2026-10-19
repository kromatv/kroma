import { type RefObject, useEffect, useEffectEvent } from 'react';
import type { View } from 'react-native';
import type { ScrubGestureOptions, ScrubHandlers } from './scrub-gesture-types';

/** A vertical drag along `target`, reported as offsets from its top edge. */
export function useScrubGesture(
  target: RefObject<View | null>,
  { onScrub, onEnd }: ScrubGestureOptions,
): ScrubHandlers {
  const scrub = useEffectEvent((offsetY: number) => onScrub(offsetY));
  const end = useEffectEvent(() => onEnd());

  useEffect(() => {
    const node = target.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      scrub(e.clientY - node.getBoundingClientRect().top);
    };
    const move = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      scrub(e.clientY - node.getBoundingClientRect().top);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
    };
  }, [target]);

  return null;
}
