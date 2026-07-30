import { hashString } from '@kroma/core';
import { useMemo } from 'react';
import { type DimensionValue, Pressable } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Img } from '#ui/components/atoms/img';
import { Txt } from '#ui/components/atoms/text';
import { gradient } from '#ui/lib/css';
import { colors, fonts } from '#ui/lib/tokens';
import { FOCUS_SCALE, FOCUS_SHADOW } from '../lib/style';
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
        style={focused ? FOCUSED : null}
      >
        <Img src={item.posterUrl ?? null} background={placeholder} fill />
        <Box fill pointerEvents="none" style={VIGNETTE} />
        {item.durationLabel ? (
          <Box absolute right={10} bottom={10} radius={7} bg="rgba(0, 0, 0, 0.72)" px={9} py={3}>
            <Txt style={DURATION}>{item.durationLabel}</Txt>
          </Box>
        ) : null}
      </Box>
      {item.categoryLabel ? (
        <Txt lines={1} style={CATEGORY} color="accent">
          {item.categoryLabel}
        </Txt>
      ) : null}
      <Txt style={TITLE}>{item.title}</Txt>
      {item.subtitle ? (
        <Txt style={SUBTITLE} color="rgba(244, 243, 240, 0.5)">
          {item.subtitle}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const FOCUSED = { boxShadow: FOCUS_SHADOW, transform: [{ scale: FOCUS_SCALE }] };

const DURATION = {
  fontFamily: fonts.ui,
  fontSize: 12,
  fontWeight: '700' as const,
  color: '#FFFFFF',
  fontVariant: ['tabular-nums' as const],
};

const CATEGORY = {
  // Clears the focused still's lift (FOCUS_SCALE grows it ~8px downwards) so
  // the ring never sits on top of the eyebrow.
  marginTop: 18,
  fontFamily: fonts.ui,
  fontSize: 11,
  fontWeight: '700' as const,
  letterSpacing: 0.99,
  textTransform: 'uppercase' as const,
};

const TITLE = {
  marginTop: 4,
  fontFamily: fonts.ui,
  fontSize: 17,
  lineHeight: 21,
  fontWeight: '600' as const,
  color: colors.text,
};

const SUBTITLE = { marginTop: 3, fontFamily: fonts.ui, fontSize: 14, fontWeight: '500' as const };
