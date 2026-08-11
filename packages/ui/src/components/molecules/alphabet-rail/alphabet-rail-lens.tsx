// The amber lens covering the stretch of letters on screen, and the bubble a
// scrubbing finger drags with it. Both belong to the Root: the lens is one box
// crossing several rows, so no row can draw it.

import { useEffect, useRef } from 'react';
import { Animated, Platform, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { ease } from '#ui/lib/ease';
import { PAD, ROW_W } from './alphabet-rail-context';

const WEB = Platform.OS === 'web';

const TRAVEL_MS = 260;
const CHASE_MS = 160;
const BUBBLE = 64;

interface LensBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Single short row: the lens tightens to a true circle; any taller stretch
// fills the rail's width as a stadium.
function lensFor(lit: [number, number], rowH: number): LensBox {
  const height = (lit[1] - lit[0] + 1) * rowH;
  const width = Math.min(ROW_W, height);
  return {
    x: PAD + (ROW_W - width) / 2,
    y: PAD + lit[0] * rowH,
    width,
    height,
  };
}

function Lens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  if (WEB) return <WebLens box={box} chase={chase} />;
  return <NativeLens box={box} chase={chase} />;
}

function WebLens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  // The first box is taken without a transition: a lens animating in from
  // nowhere on mount would be an entrance nobody staged.
  const placed = useRef(false);
  const had = placed.current;
  if (box) placed.current = true;
  const last = useRef<LensBox | null>(null);
  if (box) last.current = box;
  const shown = box ?? last.current;
  if (!shown) return null;
  return (
    <Box
      absolute
      radius="pill"
      bg="accent"
      style={
        {
          left: shown.x,
          top: shown.y,
          width: shown.width,
          height: shown.height,
          opacity: box ? 1 : 0,
          transitionProperty: had ? 'left, top, width, height, opacity' : 'opacity',
          transitionDuration: `${chase ? CHASE_MS : TRAVEL_MS}ms`,
          transitionTimingFunction: ease.spring.css,
        } as ViewStyle
      }
    />
  );
}

function NativeLens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  const left = useRef(new Animated.Value(0)).current;
  const top = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const last = useRef<LensBox | null>(null);
  if (box) last.current = box;

  useEffect(() => {
    if (box && !placed.current) {
      placed.current = true;
      left.setValue(box.x);
      top.setValue(box.y);
      width.setValue(box.width);
      height.setValue(box.height);
      shown.setValue(1);
      return;
    }
    const eased = {
      duration: chase ? CHASE_MS : TRAVEL_MS,
      easing: ease.spring.native,
      useNativeDriver: false,
    } as const;
    if (box) {
      Animated.parallel([
        Animated.timing(left, { toValue: box.x, ...eased }),
        Animated.timing(top, { toValue: box.y, ...eased }),
        Animated.timing(width, { toValue: box.width, ...eased }),
        Animated.timing(height, { toValue: box.height, ...eased }),
        Animated.timing(shown, { toValue: 1, ...eased }),
      ]).start();
      return;
    }
    Animated.timing(shown, { toValue: 0, ...eased }).start();
  }, [box, chase, left, top, width, height, shown]);

  if (!last.current && !box) return null;
  return <Animated.View style={[s.lens, { left, top, width, height, opacity: shown }]} />;
}

/** The letter under a scrubbing finger, held clear of it. */
function Bubble({ letter, y }: Readonly<{ letter: string; y: number }>) {
  return (
    <Box
      absolute
      align="center"
      justify="center"
      bg="accent"
      radius="2xl"
      style={{
        right: ROW_W + PAD * 2 + 18,
        top: y - BUBBLE / 2,
        width: BUBBLE,
        height: BUBBLE,
      }}
    >
      <Text selectable={false} variant="subheadingTv" color="accentInk">
        {letter}
      </Text>
    </Box>
  );
}

const s = styles({
  lens: { absolute: true, radius: 'pill', bg: 'accent' },
});

export { Bubble, Lens, lensFor };
