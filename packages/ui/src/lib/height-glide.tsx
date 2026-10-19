import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { ease } from './ease';

/** A clipping box that glides to `height`; `undefined` sizes it to its content. */
export interface HeightGlideProps {
  height?: number;
  durationMs: number;
  children: ReactNode;
}

const CLIP = { overflow: 'hidden' } as const;

/** Glides with an `Animated` height, adopting the first one without motion. */
export function HeightGlide({ height, durationMs, children }: Readonly<HeightGlideProps>) {
  const [value] = useState(() => new Animated.Value(height ?? 0));
  const settled = useRef(height);
  useEffect(() => {
    if (height === undefined) return;
    if (settled.current === undefined) {
      value.setValue(height);
      settled.current = height;
      return;
    }
    settled.current = height;
    Animated.timing(value, {
      toValue: height,
      duration: durationMs,
      easing: ease.out.native,
      useNativeDriver: false,
    }).start();
  }, [height, value, durationMs]);

  if (height === undefined) return <>{children}</>;
  return <Animated.View style={[CLIP, { height: value }]}>{children}</Animated.View>;
}
