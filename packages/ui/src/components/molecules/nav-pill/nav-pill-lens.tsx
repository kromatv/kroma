// The amber lens that travels to the item under it. Owned by the Root: it is
// one box crossing the whole capsule, so no item can draw it.

import { useEffect, useRef } from 'react';
import { Animated, Platform, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { styles } from '#ui/core';
import { ease } from '#ui/lib/ease';
import type { LensRect } from './nav-pill-context';

const WEB = Platform.OS === 'web';

const TRAVEL_MS = 260;
const CHASE_MS = 160;
const EASE_CSS = ease.spring.css;
const EASE_NATIVE = ease.spring.native;

interface LensProps {
  rect: LensRect | null;
  chase: boolean;
}

function Lens({ rect, chase }: Readonly<LensProps>) {
  if (WEB) return <WebLens rect={rect} chase={chase} />;
  return <NativeLens rect={rect} chase={chase} />;
}

function WebLens({ rect, chase }: Readonly<LensProps>) {
  // The first box is taken without a transition: a lens animating in from
  // nowhere on mount would be an entrance nobody staged.
  const placed = useRef(false);
  const had = placed.current;
  if (rect) placed.current = true;
  const last = useRef<LensRect | null>(null);
  if (rect) last.current = rect;
  const box = rect ?? last.current;
  if (!box) return null;
  return (
    <Box
      absolute
      radius="pill"
      bg="accentSoft"
      style={
        {
          // The travel rides a transform, not `left`. Both land the pill in the
          // same place, but `left` is laid out and painted on every frame of the
          // slide while a transform is handed to the compositor - and on a
          // television that is the difference between a slide and a jump.
          //
          // The WIDTH is still a width. `scaleX` would put it on the compositor
          // too, and would stretch the pill's corner radius into ellipses for
          // the length of every move; the box is absolutely positioned, so
          // laying it out disturbs nothing around it.
          left: 0,
          top: box.y,
          width: box.width,
          height: box.height,
          transform: `translateX(${box.x}px)`,
          opacity: rect ? 1 : 0,
          transitionProperty: had ? 'transform, width, opacity' : 'opacity',
          transitionDuration: `${chase ? CHASE_MS : TRAVEL_MS}ms`,
          transitionTimingFunction: EASE_CSS,
          // Asked for up front, so the first frame of a slide is not also the
          // frame that promotes the layer.
          willChange: 'transform',
        } as ViewStyle
      }
    />
  );
}

function NativeLens({ rect, chase }: Readonly<LensProps>) {
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const last = useRef<LensRect | null>(null);
  if (rect) last.current = rect;

  useEffect(() => {
    if (rect && !placed.current) {
      placed.current = true;
      left.setValue(rect.x);
      width.setValue(rect.width);
      shown.setValue(1);
      return;
    }
    const eased = {
      duration: chase ? CHASE_MS : TRAVEL_MS,
      easing: EASE_NATIVE,
      useNativeDriver: false,
    } as const;
    if (rect) {
      Animated.parallel([
        Animated.timing(left, { toValue: rect.x, ...eased }),
        Animated.timing(width, { toValue: rect.width, ...eased }),
        Animated.timing(shown, { toValue: 1, ...eased }),
      ]).start();
      return;
    }
    Animated.timing(shown, { toValue: 0, ...eased }).start();
  }, [rect, chase, left, width, shown]);

  const box = rect ?? last.current;
  if (!box) return null;
  // Only x and width travel: every item shares the row's height and baseline.
  return (
    <Animated.View
      style={[s.lens, { left, width, opacity: shown, top: box.y, height: box.height }]}
    />
  );
}

const s = styles({
  lens: { absolute: true, radius: 'pill', bg: 'accentSoft' },
});

export { Lens };
