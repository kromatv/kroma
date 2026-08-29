import { type ReactElement, useEffect, useState } from 'react';
import { Animated, View, type ViewStyle } from 'react-native';
import { styles } from '#ui/core';
import { WEB } from '#ui/lib/platform';
import { EASE_CSS, EASE_NATIVE, SETTLE_MS } from './strip-motion';

type Axis = 'x' | 'y';

interface MovingStripProps {
  /** How far the strip has travelled, in px along `axis`. The content is
   *  translated by the NEGATIVE of it, so a growing offset walks it out of view. */
  offset: number;
  axis: Axis;
  /** Travel there with no transition. True while a gesture drives the strip, so
   *  it tracks the input rather than chasing it. */
  still?: boolean;
  style?: ViewStyle;
  children: ReactElement;
}

// Web: a CSS transition on `transform`, since react-native-web has no native
// driver and an Animated value there is a rAF loop competing with React for the
// main thread. Native: `Animated`, where the driver is real.
function MovingStrip({ offset, axis, still = false, style, children }: Readonly<MovingStripProps>) {
  if (WEB) {
    return (
      <View
        style={[
          axis === 'x' ? s.row : null,
          style,
          {
            transform: axis === 'x' ? [{ translateX: -offset }] : [{ translateY: -offset }],
            // CSS-only props react-native-web understands and RN's types do not.
            transitionProperty: 'transform',
            transitionDuration: still ? '0ms' : `${SETTLE_MS}ms`,
            transitionTimingFunction: EASE_CSS,
          } as ViewStyle,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <MovingStripNative offset={offset} axis={axis} still={still} style={style}>
      {children}
    </MovingStripNative>
  );
}

function MovingStripNative({
  offset,
  axis,
  still = false,
  style,
  children,
}: Readonly<MovingStripProps>) {
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (still) {
      slide.setValue(-offset);
      return;
    }
    Animated.timing(slide, {
      toValue: -offset,
      duration: SETTLE_MS,
      easing: EASE_NATIVE,
      useNativeDriver: true,
    }).start();
  }, [offset, still, slide]);

  return (
    <Animated.View
      style={[
        axis === 'x' ? s.row : null,
        style,
        axis === 'x'
          ? { transform: [{ translateX: slide }] }
          : { transform: [{ translateY: slide }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const s = styles({
  row: { row: true, align: 'center' },
});

export { MovingStrip };
