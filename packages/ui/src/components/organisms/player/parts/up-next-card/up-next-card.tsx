import { hashString } from '@kromatv/core';
import { useMemo } from 'react';
import type { DimensionValue } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import { FOCUS_SCALE } from '#ui/components/organisms/player/lib/style';
import { style, styles } from '#ui/core';
import { useStyles } from '#ui/core/styles';
import { typeSpec as textRoles } from '#ui/core/tokens';
import { gradient } from '#ui/lib/css';
import { NO_OUTLINE } from '#ui/lib/field-shell';

export interface UpNextItem {
  id: string;
  title: string;
  subtitle?: string;
  posterUrl?: string | null;
  categoryLabel?: string;
}

export interface UpNextCardProps {
  item: UpNextItem;
  /** Handed the card's `item`, so one handler serves the whole sheet rather
   *  than a closure per card. */
  onActivate: (item: UpNextItem) => void;
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
const VIGNETTE = style(
  gradient(
    'linear-gradient(180deg, rgba(0,0,0,0.05) 38%, rgba(0,0,0,0.62) 76%, rgba(0,0,0,0.88) 100%)',
  ),
);

/** The card's face: artwork, its scrim, and the caption ON it.
 *
 * Inside rather than under: a caption below the still is outside the control,
 * so the ring boxed the picture and left the words out of it, and the focus
 * scale slid them into the row beneath. */
function Face({ item }: Readonly<{ item: UpNextItem }>) {
  const s = useStyles(sDefinition);

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
          <Text lines={1} style={s.category} color="accentText">
            {item.categoryLabel}
          </Text>
        ) : null}
        <Text lines={1} style={s.title}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text lines={1} style={s.subtitle} color="white/72">
            {item.subtitle}
          </Text>
        ) : null}
      </Box>
    </>
  );
}

/**
 * One card of the up-next sheet: a still with its caption on it.
 *
 * The card is a <Focusable> around its picture, like every tile in the product,
 * so the ring, the lift, the focus scale and the scroll that brings it into view
 * are the kit's. The parked peek draws the same picture with no control around
 * it, so the remote cannot reach it while it drives the chrome.
 */
export function UpNextCard({
  item,
  onActivate,
  autoFocus,
  interactive = true,
  width = '100%',
}: Readonly<UpNextCardProps>) {
  const s = useStyles(sDefinition);

  const face = (
    <Box style={s.face}>
      <Face item={item} />
    </Box>
  );
  if (!interactive) return <Box style={[s.card, { width }]}>{face}</Box>;
  return (
    <Focusable
      label={item.title}
      onPress={() => onActivate(item)}
      autoFocus={autoFocus}
      focusScale={FOCUS_SCALE}
      style={[s.card, { width }, NO_OUTLINE]}
    >
      {face}
    </Focusable>
  );
}

const sDefinition = styles({
  card: { aspect: 16 / 9, radius: 'xl' },
  face: {
    absolute: true,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    radius: 'xl',
    overflow: 'hidden',
    bg: 'surface1',
  },
  vignette: { pointerEvents: 'none' },
  category: {
    font: 'ui',
    fontSize: textRoles.overline.size,
    fontWeight: '700',
    letterSpacing: 0.99,
    textTransform: 'uppercase',
  },
  title: {
    font: 'ui',
    fontSize: textRoles.cardTitle.size,
    lineHeight: 21,
    fontWeight: '700',
    color: 'white',
  },
  subtitle: { font: 'ui', fontSize: textRoles.meta.size, fontWeight: '500' },
});
