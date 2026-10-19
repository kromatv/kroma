import { type RefObject, useEffectEvent, useRef, useState } from 'react';
import { PanResponder, type View } from 'react-native';
import { panHandlers } from './pan-gestures';
import type { ScrubGestureOptions, ScrubHandlers } from './scrub-gesture-types';

/** A vertical drag along `target`, reported as offsets from its top edge. */
export function useScrubGesture(
  target: RefObject<View | null>,
  { onScrub, onEnd, slop }: ScrubGestureOptions,
): ScrubHandlers {
  const originY = useRef<number | null>(null);

  const grab = useEffectEvent(() => {
    originY.current = null;
    const node = target.current as
      | (View & { getBoundingClientRect?: () => { top: number } })
      | null;
    if (node?.getBoundingClientRect) {
      const scrollY = (globalThis as { scrollY?: number }).scrollY ?? 0;
      originY.current = node.getBoundingClientRect().top + scrollY;
    } else {
      node?.measureInWindow((_x, y) => {
        originY.current = y;
      });
    }
  });
  const drag = useEffectEvent((moveY: number) => {
    if (originY.current === null) return;
    onScrub(moveY - originY.current);
  });
  const end = useEffectEvent(() => onEnd());
  const within = useEffectEvent(() => slop);

  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dy) > within() && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => grab(),
      onPanResponderMove: (_event, gesture) => drag(gesture.moveY),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => end(),
      onPanResponderTerminate: () => end(),
    }),
  );

  return panHandlers(pan);
}
