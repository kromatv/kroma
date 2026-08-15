// The splash backdrop's slow drift, native (iOS / tvOS / Android / Android TV).
//
// One API, two files: the caller hands over the geometry and gets a style back,
// and never asks which platform it is on. See splash-motion.web.ts for the
// half that compiles to @keyframes.

import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

export interface DriftSpec {
  /** Travel as a fraction of the measured box, per axis. */
  x: number;
  y: number;
  /** The constant overscan that keeps an edge out of frame while it pans. Held
   *  still rather than animated: a scale in flight makes a compositor
   *  re-rasterise the layer on every frame. */
  zoom: number;
  /** One leg of the round trip, in ms. */
  ms: number;
  /** The measured box the fractions are taken against. React Native cannot
   *  interpret a percentage inside a transform, so the native half needs the
   *  pixels; the web half ignores these and lets CSS take the percentage. */
  width: number;
  height: number;
}

/**
 * The drift for the artwork layer: a slow pan across a frame held oversized for
 * it, out and back, forever. Belongs on an `Animated.View` - it carries an
 * `Animated.Value`, which is why it is cast rather than typed.
 */
export function useDrift(spec: Readonly<DriftSpec>): StyleProp<ViewStyle> {
  const { x, y, zoom, ms, width, height } = spec;
  const [clock] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const leg = { duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true } as const;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(clock, { toValue: 1, ...leg }),
        Animated.timing(clock, { toValue: 0, ...leg }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [clock, ms]);

  // Memoised: a fresh transform array hands <Animated.View> a new node graph to
  // tear down and re-attach, and that is bridge traffic for every node in it -
  // re-issued mid-animation on every render of whatever holds the backdrop. The
  // deps only move on a genuine resize.
  return useMemo(
    () =>
      ({
        transform: [
          {
            translateX: clock.interpolate({
              inputRange: [0, 1],
              outputRange: [width * x, -width * x],
            }),
          },
          {
            translateY: clock.interpolate({
              inputRange: [0, 1],
              outputRange: [height * y, -height * y],
            }),
          },
          { scale: zoom },
        ],
      }) as unknown as StyleProp<ViewStyle>,
    [clock, x, y, zoom, width, height],
  );
}

/** The colour grade for the artwork. A CSS filter, so the panel has none. */
export const GRADE: StyleProp<ViewStyle> = null;
