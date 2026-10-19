import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { ease } from './ease';
import type { GlideBoxProps, GlideRect } from './glide-box-types';

interface Motion {
  left: Animated.Value;
  top: Animated.Value;
  width: Animated.Value;
  height: Animated.Value;
  shown: Animated.Value;
}

/** A box that travels to each rect it is given and fades out on null. */
export function GlideBox({ rect, durationMs, slideX = false, style }: Readonly<GlideBoxProps>) {
  const [motion] = useState<Motion>(() => ({
    left: new Animated.Value(0),
    top: new Animated.Value(0),
    width: new Animated.Value(0),
    height: new Animated.Value(0),
    shown: new Animated.Value(0),
  }));
  const placed = useRef(false);
  const [last, setLast] = useState<GlideRect | null>(null);
  if (rect && rect !== last) setLast(rect);

  useEffect(() => {
    if (rect && !placed.current) {
      placed.current = true;
      motion.left.setValue(rect.x);
      motion.top.setValue(rect.y);
      motion.width.setValue(rect.width);
      motion.height.setValue(rect.height);
      motion.shown.setValue(1);
      return;
    }
    const eased = { duration: durationMs, easing: ease.spring.native, useNativeDriver: false };
    if (rect) {
      const to = (value: Animated.Value, toValue: number) =>
        Animated.timing(value, { toValue, ...eased });
      const travel = slideX
        ? [to(motion.left, rect.x), to(motion.width, rect.width)]
        : [
            to(motion.left, rect.x),
            to(motion.top, rect.y),
            to(motion.width, rect.width),
            to(motion.height, rect.height),
          ];
      Animated.parallel([
        ...travel,
        Animated.timing(motion.shown, { toValue: 1, ...eased }),
      ]).start();
      return;
    }
    Animated.timing(motion.shown, { toValue: 0, ...eased }).start();
  }, [rect, durationMs, slideX, motion]);

  const box = rect ?? last;
  if (!box) return null;
  const { left, top, width, height, shown } = motion;
  const vertical = slideX ? { top: box.y, height: box.height } : { top, height };
  return <Animated.View style={[style, { left, width, opacity: shown }, vertical]} />;
}
