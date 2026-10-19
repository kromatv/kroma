import { type StyleScope, sharedStyle, styles, useStyleScope } from '#ui/core';

// The sheet's entrance and exit: a CSS transition on the browser, an animated
// transform on native, and the mounted/shown pair that keeps the panel in the
// tree long enough for the exit to play.

import { type ReactNode, useEffect, useState } from 'react';

import { useStyles } from '#ui/core/styles';
import { motion } from '#ui/core/tokens';
import { ease } from '#ui/lib/ease';
import { GlideView } from '#ui/lib/glide-view';

const SLIDE_MS = motion.duration.slow;

type DrawerSide = 'left' | 'right';

/** Where the slide is between mounted and shown: `mounted` keeps the panel in
 *  the tree for the exit, `shown` drives the transform, one frame late on enter
 *  so the transition has an off-screen start to play from. */
function useSlide(open: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  if (open && !mounted) setMounted(true);
  if (!open && shown) setShown(false);
  useEffect(() => {
    if (open) return;
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

interface SlidePanelProps {
  shown: boolean;
  side: DrawerSide;
  width: number;
  inset: number;
  children: ReactNode;
}

function SlidePanel({ shown, side, width, inset, children }: Readonly<SlidePanelProps>) {
  const scope = useStyleScope();

  const s = useStyles(sDefinition);

  const holder = [
    side === 'right' ? s.holderRight : s.holderLeft,
    inset ? frame(inset, scope) : null,
  ];
  const away = (width + 2 * inset) * 1.05 * (side === 'right' ? 1 : -1);
  return (
    <GlideView x={shown ? 0 : away} ms={SLIDE_MS} easing={ease.out} style={holder}>
      {children}
    </GlideView>
  );
}

const moveDefinition = styles({
  fade: {
    transitionProperty: 'opacity',
    transitionDuration: `${SLIDE_MS}ms`,
    transitionTimingFunction: ease.out.css,
  },
});

const FADE = moveDefinition.fade;

const frame = (inset: number, scope: StyleScope) =>
  sharedStyle(`drawer:frame:${inset}`, { padding: inset, pointerEvents: 'box-none' }, scope);

const sDefinition = styles({
  holderRight: { absolute: true, top: 0, bottom: 0, right: 0, maxW: '100%' },
  holderLeft: { absolute: true, top: 0, bottom: 0, left: 0, maxW: '100%' },
});

export type { DrawerSide };
export { FADE, SLIDE_MS, SlidePanel, useSlide };
