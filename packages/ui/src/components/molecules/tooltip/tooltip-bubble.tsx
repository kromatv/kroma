import { useStyles } from '#ui/core/styles';
import { fontSizes as textSizes } from '#ui/core/tokens';

import { useEffect, useId, useRef, useState } from 'react';
import { styles } from '#ui/core';
import { classes } from '#ui/lib/classed';
import { webWindow } from '#ui/lib/dom';
import { OVERLAY_Z } from '#ui/lib/overlay-z';
import { Portal } from '#ui/lib/portal';
import type { TooltipProps } from './tooltip-props';

const SHOW_DELAY_MS = 300;
const GAP = 8;

interface Spot {
  left: number;
  top: number;
}

const sDefinition = styles({
  wrap: { display: 'inline-flex' },
  tip: {
    position: 'fixed',
    transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
    zIndex: OVERLAY_Z.tooltip,
    maxWidth: 280,
    py: 6,
    px: 10,
    radius: 'sm',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'borderStrong',
    bg: 'surface2',
    color: 'text',
    fontSize: textSizes.caption,
    fontWeight: '600',
    lineHeight: '1.4',
    pointerEvents: 'none',
  },
});
function TooltipBubble({ label, children }: Readonly<TooltipProps>) {
  const s = useStyles(sDefinition);

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

  const shown = spot !== null;
  useEffect(() => {
    if (!shown) return;
    const settle = () => {
      const rect = box.current?.getBoundingClientRect();
      if (rect) setSpot({ left: rect.left + rect.width / 2, top: rect.top - GAP });
    };
    const view = webWindow();
    if (!view) return;
    view.addEventListener('resize', settle);
    view.addEventListener('scroll', settle, true);
    return () => {
      view.removeEventListener('resize', settle);
      view.removeEventListener('scroll', settle, true);
    };
  }, [shown]);

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the wrapper only watches hover/focus travelling through it; the child stays the interactive element.
    <span
      ref={box}
      className={classes(s.wrap)}
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
  const s = useStyles(sDefinition);

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

export { TooltipBubble };
