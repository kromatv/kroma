import {
  Box,
  color,
  delegateOf,
  Focusable,
  motion,
  sharedStyle,
  styles,
  useFocusVisible,
  WatchedBadge,
} from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import { type PosterAction, PosterActionBar } from '#web/shared/ui/poster-action-bar';

const NO_HOVER =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

const EASE = `cubic-bezier(${motion.bezier.out.join(', ')})`;

const transition = (property: string) => ({
  transitionProperty: property,
  transitionDuration: `${motion.duration.base}ms`,
  transitionTimingFunction: EASE,
});

const move = styles({
  artFade: transition('opacity'),
  lift: transition('transform'),
  art: transition('box-shadow, outline-color'),
});

export const ART_FADE = move.artFade;

const washOf = (image: string) => sharedStyle(`poster:wash:${image}`, { backgroundImage: image });

const s = styles({
  hit: { w: '100%', radius: 'xl' },
  lift: { transform: [{ translateY: motion.focusLift }] },
  art: {
    aspect: 2 / 3,
    radius: 'xl',
    overflow: 'hidden',
    outlineStyle: 'solid',
    outlineWidth: 3,
    outlineColor: 'transparent',
  },
  artLit: { outlineColor: color('accent') },
});

export interface PosterTileProps {
  label: string;
  width?: number;
  background: string;
  watched?: boolean;
  actions: readonly PosterAction[];
  art: (engaged: boolean) => ReactNode;
  children?: ReactNode;
  asChild?: boolean;
  footer?: ReactNode;
}

export function PosterTile({
  label,
  width,
  background,
  watched = false,
  actions,
  art,
  asChild,
  children,
  footer,
}: Readonly<PosterTileProps>) {
  const delegate = delegateOf(asChild, children);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  // Focus counts only when the viewer asked for it. A click focuses the disc it
  // pressed and nothing blurs it until the next click, so raw focus left the bar
  // and the caption up on a tile the cursor had long since left.
  const keyboardWithin = useFocusVisible(focusWithin);
  // The frame reports both, not the <Focusable>: the bar sits OVER the control,
  // so a cursor moving onto a disc leaves the control and would drop the tile's
  // hover with it.
  const engaged = NO_HOVER || hovered || keyboardWithin;
  // The fold and the action bar share the top-right corner, so the mark stands
  // down whenever the bar is up - including on a coarse pointer, which keeps the
  // bar up permanently. Nothing is lost: the bar's own watched toggle is lit,
  // which is the same fact said by the control that changes it.
  const fold = watched && !engaged;

  return (
    // Two boxes, because the one that reports hover must not be the one that
    // moves: a lifting box whose bottom edge crosses the cursor leaves, comes
    // back, and oscillates at the frame rate.
    <Box
      w={width ?? '100%'}
      shrink={0}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={() => setFocusWithin(false)}
    >
      <Box style={hovered ? [move.lift, s.lift] : move.lift}>
        <Focusable label={label} asChild={asChild} style={s.hit}>
          {delegate.wrap(
            <Box style={[s.art, washOf(background), move.art, hovered ? s.artLit : null]}>
              {art(engaged)}
              {watched ? (
                <Box fill pointerEvents="none" opacity={fold ? 1 : 0}>
                  <WatchedBadge corner="top-right" />
                </Box>
              ) : null}
            </Box>,
          )}
        </Focusable>
        <PosterActionBar actions={actions} shown={engaged} />
      </Box>
      {footer}
    </Box>
  );
}
