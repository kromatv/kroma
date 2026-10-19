import { type ReactNode, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import type { StageCard } from '#ui/components/organisms/player/lib/stage-card';
import { CARD_MS } from '#ui/components/organisms/player/lib/panel-slide';
import { ease } from '#ui/lib/ease';

/** The settings card's corner radius, in canvas pixels. */
export const CARD_RADIUS = 72;

const pct = (fraction: number): `${number}%` => `${fraction * 100}%`;

/** The radius the picture's box rounds itself to: the browser box clips its own
 * child element. */
export function cardCorner(radius: number): number {
  return radius;
}

/** The stage's shrink progress. Never animated in a browser: the transform is a
 * CSS transition (see `zoomStyle`). */
export function useStageZoom(settingsShrink: boolean, _active: boolean): Animated.Value {
  const [zoom] = useState(() => new Animated.Value(settingsShrink ? 1 : 0));
  return zoom;
}

// The browsers do not have `Animated`'s native driver at all: react-native-web
// warns once and falls back to a JS animation, so every frame of the shrink
// would be a render on the same thread the chrome ticks on. A CSS transition
// hands the whole movement to the compositor instead and costs one style write,
// which on a television is the difference between a shrink and a stutter.
//
// `transformOrigin` is the web's road: a television shell CSS-scales its whole
// canvas, so a pixel written back there is read at layout size while `onLayout`
// reported the scaled one, and the origin is the one way to say it without a
// unit.
/** The stage's transform onto the settings card. */
export function zoomStyle(
  _zoom: Animated.Value,
  card: StageCard,
  _width: number,
  shrink: boolean,
): ViewStyle {
  return {
    transformOrigin: `${pct(card.origin)} 50%`,
    transform: `scale(${shrink ? card.scale : 1})`,
    transitionProperty: 'transform',
    transitionDuration: `${CARD_MS}ms`,
    transitionTimingFunction: ease.out.css,
    // Asked for up front, so the first frame of the shrink is not also the frame
    // that promotes the layer.
    willChange: 'transform',
  } as ViewStyle;
}

/** Nothing in a browser: the picture's box rounds its own corners. */
export function StageCornerMask(_props: Readonly<{ zoom: Animated.Value }>): ReactNode {
  return null;
}
