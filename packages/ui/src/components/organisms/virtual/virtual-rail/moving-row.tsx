import { type ReactElement, useEffect, useState } from 'react';
import { Animated, View, type ViewStyle } from 'react-native';
import { styles } from '#ui/core';
import { WEB } from '#ui/lib/platform';
import { EASE_CSS, EASE_NATIVE, SETTLE_MS } from './rail-motion';

// Web: a CSS transition on `transform`, since react-native-web has no native
// driver and an Animated value there is a rAF loop competing with React for the
// main thread. Native: `Animated`, where the driver is real.
function MovingRow({
  offset,
  style,
  children,
}: Readonly<{
  offset: number;
  style?: ViewStyle;
  children: ReactElement;
}>) {
  if (WEB) {
    return (
      <View
        style={[
          s.row,
          style,
          {
            transform: [{ translateX: -offset }],
            // CSS-only props react-native-web understands and RN's types do not.
            transitionProperty: 'transform',
            transitionDuration: `${SETTLE_MS}ms`,
            transitionTimingFunction: EASE_CSS,
          } as ViewStyle,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <MovingRowNative offset={offset} style={style}>
      {children}
    </MovingRowNative>
  );
}

function MovingRowNative({
  offset,
  style,
  children,
}: Readonly<{
  offset: number;
  style?: ViewStyle;
  children: ReactElement;
}>) {
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: -offset,
      duration: SETTLE_MS,
      easing: EASE_NATIVE,
      useNativeDriver: true,
    }).start();
  }, [offset, slide]);

  return (
    <Animated.View style={[s.row, style, { transform: [{ translateX: slide }] }]}>
      {children}
    </Animated.View>
  );
}

const s = styles({
  row: { row: true, align: 'center' },
});

export { MovingRow };
