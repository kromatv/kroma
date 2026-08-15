// The amber lens covering the stretch of letters on screen, and the bubble a
// scrubbing finger drags with it. Both belong to the Root: the lens is one box
// crossing several rows, so no row can draw it.

import { useEffect, useRef, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Text } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { ease } from '#ui/lib/ease';
import { WEB } from '#ui/lib/platform';
import { PAD, ROW_W } from './alphabet-rail-context';

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
  // Both are state updated during render - the sanctioned previous-value shape,
  // and the one the compiler can memoise around. `last` is the box the lens
  // HELD, so a lens fading out keeps its place; `entering` is true until the
  // first MOVE, so the first box is taken with an opacity-only transition
  // rather than an entrance nobody staged.
  const [last, setLast] = useState<LensBox | null>(null);
  const [entering, setEntering] = useState(true);
  if (box && last && box !== last && entering) setEntering(false);
  if (box && box !== last) setLast(box);
  const shown = box ?? last;
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
          transitionProperty: entering ? 'opacity' : 'left, top, width, height, opacity',
          transitionDuration: `${chase ? CHASE_MS : TRAVEL_MS}ms`,
          transitionTimingFunction: ease.spring.css,
        } as ViewStyle
      }
    />
  );
}

interface LensMotion {
  left: Animated.Value;
  top: Animated.Value;
  width: Animated.Value;
  height: Animated.Value;
  shown: Animated.Value;
}

function NativeLens({ box, chase }: Readonly<{ box: LensBox | null; chase: boolean }>) {
  const [motion] = useState<LensMotion>(() => ({
    left: new Animated.Value(0),
    top: new Animated.Value(0),
    width: new Animated.Value(0),
    height: new Animated.Value(0),
    shown: new Animated.Value(0),
  }));
  // The first box is TAKEN, not travelled to: a lens animating in from nowhere
  // on mount would be an entrance nobody staged.
  const placed = useRef(false);
  const [last, setLast] = useState<LensBox | null>(null);
  if (box && box !== last) setLast(box);

  useEffect(() => {
    if (box && !placed.current) {
      placed.current = true;
      motion.left.setValue(box.x);
      motion.top.setValue(box.y);
      motion.width.setValue(box.width);
      motion.height.setValue(box.height);
      motion.shown.setValue(1);
      return;
    }
    const eased = {
      duration: chase ? CHASE_MS : TRAVEL_MS,
      easing: ease.spring.native,
      useNativeDriver: false,
    } as const;
    if (box) {
      Animated.parallel([
        Animated.timing(motion.left, { toValue: box.x, ...eased }),
        Animated.timing(motion.top, { toValue: box.y, ...eased }),
        Animated.timing(motion.width, { toValue: box.width, ...eased }),
        Animated.timing(motion.height, { toValue: box.height, ...eased }),
        Animated.timing(motion.shown, { toValue: 1, ...eased }),
      ]).start();
      return;
    }
    Animated.timing(motion.shown, { toValue: 0, ...eased }).start();
  }, [box, chase, motion]);

  if (!last && !box) return null;
  const { left, top, width, height, shown } = motion;
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
