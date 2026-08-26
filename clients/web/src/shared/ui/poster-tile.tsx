import {
  Box,
  color,
  Focusable,
  gradient,
  type HostElement,
  motion,
  styles,
  useFocusVisible,
  WatchedBadge,
} from '@kroma/ui/kit';
import { type ReactNode, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { type PosterAction, PosterActionBar } from '#web/shared/ui/poster-action-bar';

const NO_HOVER =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

const EASE = `cubic-bezier(${motion.bezier.out.join(', ')})`;

// react-native-web understands these CSS-only props; React Native's types do not.
const transition = (property: string) =>
  ({
    transitionProperty: property,
    transitionDuration: `${motion.duration.base}ms`,
    transitionTimingFunction: EASE,
  }) as ViewStyle;

export const ART_FADE = transition('opacity');

const LIFT_MOTION = transition('transform');

const ART_MOTION = transition('box-shadow, outline-color');

// An outline, not a second shadow: a shadow list interpolates item by item, so
// growing [card] into [ring, pop] faded the card's 28px blur into the ring's
// slot and the ring arrived as a halo before it snapped.
const s = styles({
  hit: { w: '100%', radius: 'lg' },
  lift: { transform: [{ translateY: motion.focusLift }] },
  art: {
    aspect: 2 / 3,
    radius: 'lg',
    overflow: 'hidden',
    shadow: 'card',
    outlineStyle: 'solid',
    outlineWidth: 3,
    outlineColor: 'transparent',
  },
  artLit: { shadow: 'pop', outlineColor: color('accent') },
});

export interface PosterTileProps {
  label: string;
  as?: HostElement;
  width?: number;
  background: string;
  watched?: boolean;
  actions: readonly PosterAction[];
  children: (engaged: boolean) => ReactNode;
  footer?: ReactNode;
}

export function PosterTile({
  label,
  as,
  width,
  background,
  watched = false,
  actions,
  children,
  footer,
}: Readonly<PosterTileProps>) {
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
      <Box style={hovered ? [LIFT_MOTION, s.lift] : LIFT_MOTION}>
        <Focusable label={label} as={as} style={s.hit}>
          <Box style={[s.art, gradient(background), ART_MOTION, hovered ? s.artLit : null]}>
            {children(engaged)}
            {watched ? (
              <Box fill pointerEvents="none" opacity={fold ? 1 : 0}>
                <WatchedBadge corner="top-right" />
              </Box>
            ) : null}
          </Box>
        </Focusable>
        <PosterActionBar actions={actions} shown={engaged} />
      </Box>
      {footer}
    </Box>
  );
}
