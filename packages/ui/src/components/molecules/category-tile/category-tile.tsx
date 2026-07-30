import type { StyleProp, ViewStyle } from 'react-native';
// A labelled artwork tile for anything that groups titles. `background` is the
// instant fill under the art, `wash` the veil over it that keeps the label
// readable; both are CSS gradient strings.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Img } from '#ui/components/atoms/img';
import { Txt } from '#ui/components/atoms/text';
import { gradient } from '#ui/lib/css';
import { sv } from '#ui/lib/sv';
import { fonts, radius as radii } from '#ui/lib/tokens';

const categoryTileVariants = sv({
  slots: {
    frame: { flexShrink: 0, padding: 6, borderRadius: radii.xl },
    label: { fontFamily: fonts.display, fontWeight: '700', color: '#FFFFFF' },
    meta: {
      fontFamily: fonts.ui,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.72)',
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
  accent?: string;
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
      // The frame's padding is what keeps the focus ring clear of the artwork.
      style={[s.frame, { width }, style]}
    >
      <Box aspect={aspect} radius="lg" overflow="hidden" bg="surface1" shadow="card">
        <Img src={art} background={background} position="50% 25%" fill />
        {wash ? <Box fill pointerEvents="none" style={gradient(wash)} /> : null}
        <Box absolute left={20} right={20} bottom={16} gap={2}>
          {accent ? <Box h={4} w={28} radius="pill" bg={accent} mb={8} /> : null}
          <Txt style={s.label}>{label}</Txt>
          {meta ? <Txt style={s.meta}>{meta}</Txt> : null}
          {children}
        </Box>
      </Box>
    </Focusable>
  );
}

export type { CategoryTileProps, CategoryTileSize };
export { CategoryTile, categoryTileVariants };
