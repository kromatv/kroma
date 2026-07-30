// <IconWell>: a glyph sunk into a rounded, tinted square — the leading mark of a
// settings row, a server in a list, a menu entry.

import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { sv } from '#ui/lib/sv';
import { colors, radius } from '#ui/lib/tokens';

type IconWellSize = 'sm' | 'tv';
type IconWellTone = 'neutral' | 'accent';

const iconWellVariants = sv({
  slots: {
    root: {
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      borderRadius: radius.xl,
    },
  },
  variants: {
    size: {
      sm: { root: { width: 34, height: 34 } },
      tv: { root: { width: 42, height: 42 } },
    },
    tone: {
      neutral: { root: { backgroundColor: 'rgba(255, 255, 255, 0.06)' } },
      accent: { root: { backgroundColor: colors.accentSoft } },
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
