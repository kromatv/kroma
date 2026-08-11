// The pointer half of <Tooltip>: a delayed bubble over the child on hover or
// focus-within, portalled so no overflow ancestor clips it. The wrapper names
// the bubble with aria-describedby while it shows.

import { useEffect, useId, useRef, useState } from 'react';
import { activeTheme } from '#ui/core';
import { Portal } from '#ui/lib/portal';
import type { TooltipProps } from './tooltip';

const SHOW_DELAY_MS = 300;
const GAP = 8;

interface Spot {
  left: number;
  top: number;
}

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
      style={{ display: 'inline-flex' }}
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
  const { colors, radius } = activeTheme();
  return (
    <Portal>
      <span
        id={id}
        role="tooltip"
        style={{
          position: 'fixed',
          left: spot.left,
          top: spot.top,
          transform: 'translate(-50%, -100%)',
          zIndex: 120,
          maxWidth: 280,
          padding: '6px 10px',
          borderRadius: radius.sm,
          border: `1px solid ${colors.borderStrong}`,
          background: colors.surface2,
          color: colors.text,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.4,
          pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        }}
      >
        {label}
      </span>
    </Portal>
  );
}

export type { TooltipProps } from './tooltip';
export { Tooltip };
