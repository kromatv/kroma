import type { StyleProp, ViewStyle } from 'react-native';
import { sharedStyle, useStyleScope } from '#ui/core';
import { ease } from './ease';

/** The two moving faces of a two-state control: a fill that fades in, a thumb that slides. */
export interface FlipMotion {
  fill: StyleProp<ViewStyle>;
  slide: StyleProp<ViewStyle>;
}

/** Flips with CSS transitions on opacity and transform. */
export function useFlipMotion(on: boolean, travel: number, durationMs: number): FlipMotion {
  const scope = useStyleScope();
  const timing = { transitionDuration: `${durationMs}ms`, transitionTimingFunction: ease.out.css };
  const x = on ? travel : 0;
  return {
    fill: sharedStyle(
      `flip:fill:${durationMs}:${on}`,
      { ...timing, transitionProperty: 'opacity', opacity: on ? 1 : 0 },
      scope,
    ),
    slide: sharedStyle(
      `flip:slide:${durationMs}:${x}`,
      { ...timing, transitionProperty: 'transform', transform: [{ translateX: x }] },
      scope,
    ),
  };
}
