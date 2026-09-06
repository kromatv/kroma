// The pointer half of <Tooltip>: a delayed bubble over the child on hover or
// focus-within, portalled so no overflow ancestor clips it. The wrapper names
// the bubble with aria-describedby while it shows.

import { useEffect, useId, useRef, useState } from 'react';
import { styles } from '#ui/core';
import { classes } from '#ui/lib/classed';
import { Portal } from '#ui/lib/portal';
import type { TooltipProps } from './tooltip';

const SHOW_DELAY_MS = 300;
const GAP = 8;

interface Spot {
  left: number;
  top: number;
}

const s = styles({
  wrap: { display: 'inline-flex' },
  tip: {
    position: 'fixed',
    transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
    zIndex: 120,
    maxWidth: 280,
    py: 6,
    px: 10,
    radius: 'sm',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'borderStrong',
    bg: 'surface2',
    color: 'text',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: '1.4',
    pointerEvents: 'none',
  },
});
function Tooltip({ label, children }: Readonly<TooltipProps>) {
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = box.current?.getBoundingClientRect();
      if (rect) setSpot({ left: rect.left + rect.width / 2, top: rect.top - GAP });
    }, SHOW_DELAY_MS);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSpot(null);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // The bubble follows its anchor: the focus path never blurs on scroll, so a
  // once-measured position would strand the bubble at stale coordinates.
  const shown = spot !== null;
  useEffect(() => {
    if (!shown) return;
    const settle = () => {
      const rect = box.current?.getBoundingClientRect();
      if (rect) setSpot({ left: rect.left + rect.width / 2, top: rect.top - GAP });
    };
    window.addEventListener('resize', settle);
    // Capture: the scroll that moves the anchor can happen in any container.
    window.addEventListener('scroll', settle, true);
    return () => {
      window.removeEventListener('resize', settle);
      window.removeEventListener('scroll', settle, true);
    };
  }, [shown]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only watches hover/focus travelling through it; the child stays the interactive element.
    <span
      ref={box}
      className={classes(s.wrap)}
      // An inert subtree (a pressable row makes its cells one) would swallow
      // the hover this exists to watch.
      data-hoverable="true"
      aria-describedby={spot ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {spot ? <Bubble id={id} label={label} spot={spot} /> : null}
    </span>
  );
}

function Bubble({ id, label, spot }: Readonly<{ id: string; label: string; spot: Spot }>) {
  return (
    <Portal>
      <span
        id={id}
        role="tooltip"
        className={classes(s.tip)}
        style={{ left: spot.left, top: spot.top }}
      >
        {label}
      </span>
    </Portal>
  );
}

export type { TooltipProps } from './tooltip';
export { Tooltip };
