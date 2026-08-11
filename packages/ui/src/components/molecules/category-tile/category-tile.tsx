import type { StyleProp, ViewStyle } from 'react-native';
// A labelled artwork tile for anything that groups titles. `background` is the
// instant fill under the art, `wash` the veil over it that keeps the label
// readable; both are CSS gradient strings.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Text } from '#ui/components/atoms/text';
import type { ColorValue } from '#ui/core';
import { sv } from '#ui/core';
import { gradient } from '#ui/lib/css';

const NO_POINTER: ViewStyle = { pointerEvents: 'none' };

const categoryTileVariants = sv({
  slots: {
    frame: { shrink: 0, radius: 'lg' },
    label: { font: 'display', fontWeight: '700', color: 'white' },
    meta: {
      font: 'ui',
      fontWeight: '600',
      color: 'white/72',
      fontVariant: ['tabular-nums'],
    },
  },
  variants: {
    size: {
      md: { label: { fontSize: 18, lineHeight: 20 }, meta: { fontSize: 12 } },
      tv: { label: { fontSize: 23, lineHeight: 24 }, meta: { fontSize: 14 } },
    },
  },
  defaults: { size: 'tv' },
});

type CategoryTileSize = 'md' | 'tv';

interface CategoryTileProps extends Omit<FocusableProps, 'children' | 'style' | 'label'> {
  label: string;
  meta?: string;
  art?: string | null;
  background?: string;
  wash?: string;
  accent?: ColorValue;
  size?: CategoryTileSize;
  width?: number;
  aspect?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function CategoryTile({
  label,
  meta,
  art = null,
  background,
  wash,
  accent,
  size = 'tv',
  width = 340,
  aspect = 16 / 9,
  children,
  style,
  focusScale = 1.04,
  ...focusProps
}: Readonly<CategoryTileProps>) {
  const s = categoryTileVariants({ size });
  return (
    <Focusable
      {...focusProps}
      label={label}
      focusScale={focusScale}
      // Frame and artwork are the same box, on the same radius: the ring keeps
      // itself clear of the art (RING_GAP), so padding here would be a second
      // gap and a corner nobody could keep concentric.
      style={[s.frame, { width }, style]}
    >
      <Box aspect={aspect} radius="lg" overflow="hidden" bg="surface1" shadow="card">
        <Img src={art} background={background} position="50% 25%" fill />
        {wash ? <Box fill style={[NO_POINTER, gradient(wash)]} /> : null}
        <Box absolute left={20} right={20} bottom={16} gap={2}>
          {accent ? <Box h={4} w={28} radius="pill" bg={accent} mb={8} /> : null}
          <Text style={s.label}>{label}</Text>
          {meta ? <Text style={s.meta}>{meta}</Text> : null}
          {children}
        </Box>
      </Box>
    </Focusable>
  );
}

export type { CategoryTileProps, CategoryTileSize };
export { CategoryTile, categoryTileVariants };
