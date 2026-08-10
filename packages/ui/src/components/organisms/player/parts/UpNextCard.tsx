import { hashString } from '@kroma/core';
import { type ReactNode, useMemo } from 'react';
import type { DimensionValue } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Txt } from '#ui/components/atoms/text';
import { styles } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { FocusLiftHost, LIFTED } from '#ui/lib/focus-lift';
import { useFocusScale } from '#ui/lib/focus-transition';
import { FOCUS_SCALE } from '../lib/style';

export interface UpNextItem {
  id: string;
  title: string;
  subtitle?: string;
  posterUrl?: string | null;
  categoryLabel?: string;
}

export interface UpNextCardProps {
  item: UpNextItem;
  onActivate: () => void;
  /** The first card of an opening sheet takes the focus. */
  autoFocus?: boolean;
  /** False for the parked PEEK, which is a picture of the sheet rather than the
   *  sheet: its cards must not be reachable while the remote drives the chrome. */
  interactive?: boolean;
  width?: DimensionValue;
}

export const UP_NEXT_COLUMNS = 3;
export const UP_NEXT_GAP = 26;

/** The width a card is actually DRAWN at, three across a 1920 stage once the
 * sheet's padding and gaps are taken out - and so the width its artwork should
 * be requested at. The hooks used to ask for no width at all, which serves the
 * original: three full-size stills arrive and the rest of the sheet is still
 * downloading, which on a television looks exactly like art that never loads. */
export const UP_NEXT_ART_W = Math.round(
  (1920 - 56 * 2 - UP_NEXT_GAP * (UP_NEXT_COLUMNS - 1)) / UP_NEXT_COLUMNS,
);

function placeholderGradient(id: string): string {
  const tilt = 138 + (hashString(id) % 54);
  return `linear-gradient(${tilt}deg, rgba(244,182,66,0.16) 0%, rgba(20,18,22,0.96) 64%)`;
}

// Dark at the foot, clear at the head: the caption sits IN the still, so the
// artwork has to give it a floor to be read against.
const VIGNETTE = gradient(
  'linear-gradient(180deg, rgba(0,0,0,0.05) 38%, rgba(0,0,0,0.62) 76%, rgba(0,0,0,0.88) 100%)',
);

/** The card's face: artwork, its scrim, and the caption ON it.
 *
 * Inside rather than under: a caption below the still is outside the control,
 * so the ring boxed the picture and left the words out of it, and the focus
 * scale slid them into the row beneath. */
function Face({ item }: Readonly<{ item: UpNextItem }>) {
  const placeholder = useMemo(() => placeholderGradient(item.id), [item.id]);
  return (
    <>
      {/* Eager: the sheet slides in on a transform, and a lazily loaded image
          inside a translated box is one the browser never decides is visible -
          every row but the first stayed a gradient. */}
      <Img src={item.posterUrl ?? null} background={placeholder} fill priority />
      <Box fill style={[s.vignette, VIGNETTE]} />
      <Box absolute left={14} right={14} bottom={12} gap={2}>
        {item.categoryLabel ? (
          <Txt lines={1} style={s.category} color="accent">
            {item.categoryLabel}
          </Txt>
        ) : null}
        <Txt lines={1} style={s.title}>
          {item.title}
        </Txt>
        {item.subtitle ? (
          <Txt lines={1} style={s.subtitle} color="white/72">
            {item.subtitle}
          </Txt>
        ) : null}
      </Box>
    </>
  );
}

/**
 * One card of the up-next sheet: a still with its caption on it.
 *
 * The card is a <Focusable>, so the ring, the lift over its neighbours and the
 * scroll that brings it into view are the kit's, the same ones every tile in the
 * product uses - the sheet used to run its own index, its own ring and its own
 * scrolling, and each of the three drifted from the kit in its own way.
 */
export function UpNextCard({
  item,
  onActivate,
  autoFocus,
  interactive = true,
  width = '100%',
}: Readonly<UpNextCardProps>) {
  return (
    <FocusLiftHost>
      {(held) => (
        <CardBox held={held} width={width}>
          {/* The picture is clipped to the corner; the CARD is not, or the ring
              of the control over it would be cut off by its own artwork. */}
          <Box style={s.face}>
            <Face item={item} />
          </Box>
          {/* The control is an OVERLAY on the picture rather than a box around
              it, and that is what keeps the artwork loaded: parking the sheet
              takes the control away, and if the picture lived inside it, React
              would unmount the <Img> with it and every card would go blank
              until it downloaded again. */}
          {interactive ? (
            <Focusable
              label={item.title}
              onPress={onActivate}
              autoFocus={autoFocus}
              focusScale={1}
              style={s.hit}
            >
              <Box fill />
            </Focusable>
          ) : null}
        </CardBox>
      )}
    </FocusLiftHost>
  );
}

/** The card's box: it grows and rises while the control inside it holds the
 *  focus, since the control is only an overlay and cannot do either itself. */
function CardBox({
  held,
  width,
  children,
}: Readonly<{ held: boolean; width: DimensionValue; children: ReactNode }>) {
  const grow = useFocusScale(held, FOCUS_SCALE);
  return <Box style={[s.card, { width }, held ? LIFTED : null, grow]}>{children}</Box>;
}

const s = styles({
  card: { aspect: 16 / 9, radius: 14 },
  face: {
    absolute: true,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    radius: 14,
    overflow: 'hidden',
    bg: 'surface1',
  },
  hit: { absolute: true, top: 0, right: 0, bottom: 0, left: 0, radius: 14 },
  vignette: { pointerEvents: 'none' },
  category: {
    font: 'ui',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.99,
    textTransform: 'uppercase',
  },
  title: { font: 'ui', fontSize: 17, lineHeight: 21, fontWeight: '700', color: 'white' },
  subtitle: { font: 'ui', fontSize: 13, fontWeight: '500' },
});
