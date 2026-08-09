import { hashString } from '@kroma/core';
import { useMemo } from 'react';
import { type DimensionValue, Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Img } from '#ui/components/atoms/img';
import { Txt } from '#ui/components/atoms/text';
import { styles, sv } from '#ui/core';
import { gradient } from '#ui/lib/css';
import { FOCUS_SCALE } from '../lib/style';
import { VIRTUAL_FOCUS } from '../lib/virtual-focus';

export interface UpNextItem {
  id: string;
  title: string;
  subtitle?: string;
  posterUrl?: string | null;
  durationLabel?: string;
  categoryLabel?: string;
}

export interface UpNextCardProps {
  item: UpNextItem;
  focused: boolean;
  onActivate: () => void;
  onFocus?: () => void;
  width?: DimensionValue;
}

export const UP_NEXT_COLUMNS = 3;
export const UP_NEXT_GAP = 26;

function placeholderGradient(id: string): string {
  const tilt = 138 + (hashString(id) % 54);
  return `linear-gradient(${tilt}deg, rgba(244,182,66,0.16) 0%, rgba(20,18,22,0.96) 64%)`;
}

const VIGNETTE = gradient('radial-gradient(120% 120% at 50% 25%, transparent, rgba(0,0,0,0.42))');

const still = sv({
  base: { _focus: { ring: 'focusGlow', transform: [{ scale: FOCUS_SCALE }] } },
});

export function UpNextCard({
  item,
  focused,
  onActivate,
  onFocus,
  width = '100%',
}: Readonly<UpNextCardProps>) {
  const placeholder = useMemo(() => placeholderGradient(item.id), [item.id]);
  return (
    <Pressable
      {...VIRTUAL_FOCUS}
      onPress={onActivate}
      onPointerEnter={onFocus}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={{ width }}
    >
      {/* The ring and the lift belong to the artwork, not to the whole card:
          around the card they enclose the caption and the scale shoves the text
          into the row below. */}
      <Box
        aspect={16 / 9}
        w="100%"
        radius={14}
        overflow="hidden"
        bg="surface1"
        style={still(undefined, { focus: focused }).root}
      >
        <Img src={item.posterUrl ?? null} background={placeholder} fill />
        <Box fill style={[s.vignette, VIGNETTE]} />
        {item.durationLabel ? (
          <Box absolute right={10} bottom={10} radius={7} bg="black/72" px={9} py={3}>
            <Txt style={s.duration}>{item.durationLabel}</Txt>
          </Box>
        ) : null}
      </Box>
      {item.categoryLabel ? (
        <Txt lines={1} style={s.category} color="accent">
          {item.categoryLabel}
        </Txt>
      ) : null}
      <Txt style={s.title}>{item.title}</Txt>
      {item.subtitle ? (
        <Txt style={s.subtitle} color="text/50">
          {item.subtitle}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const s = styles({
  vignette: { pointerEvents: 'none' },
  duration: {
    font: 'ui',
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
    fontVariant: ['tabular-nums'],
  },
  category: {
    // Clears the focused still's lift (FOCUS_SCALE grows it ~8px downwards) so
    // the ring never sits on top of the eyebrow.
    mt: 18,
    font: 'ui',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.99,
    textTransform: 'uppercase',
  },
  title: {
    mt: 4,
    font: 'ui',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '600',
    color: 'text',
  },
  subtitle: { mt: 3, font: 'ui', fontSize: 14, fontWeight: '500' },
});
