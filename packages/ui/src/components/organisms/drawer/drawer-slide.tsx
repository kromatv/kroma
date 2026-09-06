// The sheet's entrance and exit: a CSS transition on the browser, an animated
// transform on native, and the mounted/shown pair that keeps the panel in the
// tree long enough for the exit to play.

import { type ReactNode, useEffect, useState } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { sharedStyle, styles } from '#ui/core';
import { motion } from '#ui/core/tokens';
import { ease } from '#ui/lib/ease';
import { WEB } from '#ui/lib/platform';

const SLIDE_MS = motion.duration.slow;

type DrawerSide = 'left' | 'right';

/** Where the slide is between mounted and shown: `mounted` keeps the panel in
 *  the tree for the exit, `shown` drives the transform, one frame late on enter
 *  so the transition has an off-screen start to play from. */
function useSlide(open: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setShown(false);
    const out = setTimeout(() => setMounted(false), SLIDE_MS);
    return () => clearTimeout(out);
  }, [open]);
  // Two frames after the panel mounts, not one: React may commit the mount in
  // the same frame the first callback runs in, and a panel that is first
  // painted where it ends has no off-screen start for the transition to play
  // from. The second frame is on the far side of that paint.
  useEffect(() => {
    if (!open || !mounted) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [open, mounted]);
  return { mounted, shown };
}

function SlidePanel({
  shown,
  side,
  width,
  children,
}: Readonly<{ shown: boolean; side: DrawerSide; width: number; children: ReactNode }>) {
  const holder = side === 'right' ? s.holderRight : s.holderLeft;
  if (WEB) {
    const away = side === 'right' ? SLIDE_OUT : SLIDE_OUT_LEFT;
    return <Box style={[holder, move.slide, slideTo(shown ? 0 : away)]}>{children}</Box>;
  }
  return (
    <SlidePanelNative shown={shown} side={side} width={width} holder={holder}>
      {children}
    </SlidePanelNative>
  );
}

function SlidePanelNative({
  shown,
  side,
  width,
  holder,
  children,
}: Readonly<{
  shown: boolean;
  side: DrawerSide;
  width: number;
  holder: ViewStyle;
  children: ReactNode;
}>) {
  // Initial value matches the initial state so a drawer restored open does not
  // play its own entrance.
  const [slide] = useState(() => new Animated.Value(shown ? 0 : 1));
  useEffect(() => {
    Animated.timing(slide, {
      toValue: shown ? 0 : 1,
      duration: SLIDE_MS,
      easing: ease.out.native,
      useNativeDriver: true,
    }).start();
  }, [shown, slide]);
  const off = width * 1.05 * (side === 'right' ? 1 : -1);
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [0, off] });
  return (
    <Animated.View style={[holder, { transform: [{ translateX }] }]}>{children}</Animated.View>
  );
}

// Past its own edge plus the shadow's reach, so nothing peeks while closed.
const SLIDE_OUT = '105%' as unknown as number;
const SLIDE_OUT_LEFT = '-105%' as unknown as number;

const move = styles({
  slide: {
    transitionProperty: 'transform',
    transitionDuration: `${SLIDE_MS}ms`,
    transitionTimingFunction: ease.out.css,
  },
  fade: {
    transitionProperty: 'opacity',
    transitionDuration: `${SLIDE_MS}ms`,
    transitionTimingFunction: ease.out.css,
  },
});

const FADE = move.fade;

const slideTo = (x: number) => sharedStyle(`drawer:slide:${x}`, { transform: [{ translateX: x }] });

const s = styles({
  holderRight: { absolute: true, top: 0, bottom: 0, right: 0, maxW: '100%' },
  holderLeft: { absolute: true, top: 0, bottom: 0, left: 0, maxW: '100%' },
});

export type { DrawerSide };
export { FADE, SLIDE_MS, SlidePanel, useSlide, WEB };
