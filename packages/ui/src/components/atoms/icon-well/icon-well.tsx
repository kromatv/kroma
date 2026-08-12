// <IconWell>: a glyph sunk into a rounded, tinted square. The leading mark of a
// settings row, a server in a list, a menu entry.

import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { sv, type Variant } from '#ui/core';

type IconWellSize = Variant<typeof iconWellVariants, 'size'>;
type IconWellTone = Variant<typeof iconWellVariants, 'tone'>;

const iconWellVariants = sv({
  slots: {
    root: { center: true, shrink: 0, radius: 'xl' },
  },
  variants: {
    size: {
      sm: { root: { w: 34, h: 34 } },
      tv: { root: { w: 42, h: 42 } },
    },
    tone: {
      neutral: { root: { bg: 'tint/6' } },
      accent: { root: { bg: 'accentSoft' } },
    },
  },
  defaults: { size: 'tv', tone: 'neutral' },
});

const GLYPH = { sm: 17, tv: 20 } as const;

interface IconWellProps {
  name: IconName;
  size?: IconWellSize;
  tone?: IconWellTone;
}

function IconWell({ name, size = 'tv', tone = 'neutral' }: Readonly<IconWellProps>) {
  const s = iconWellVariants({ size, tone });
  return (
    <Box style={s.root}>
      <Icon name={name} size={GLYPH[size]} color={tone === 'accent' ? 'accent' : 'textMuted'} />
    </Box>
  );
}

export type { IconWellProps, IconWellSize, IconWellTone };
export { IconWell, iconWellVariants };
