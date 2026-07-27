// <IconWell>: a glyph sunk into a rounded, tinted square.
//
// The leading mark of a settings row, a server in a list, a menu entry - the
// shape that tells you a row is ABOUT something before you read its label. It is
// a well rather than a bare glyph because a row's icons then share one optical
// weight whatever their drawing: a hollow gear and a solid television differ by
// half their ink, and the wells make them line up as one column anyway.
//
// It lives in the kit because <ListRow> drew one and the TV's server list drew
// another, four points larger, which is the drift a shared well ends. The sizes
// are the two viewing distances, as everywhere else in the kit.

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
      /** A thumb's row. */
      sm: { root: { width: 34, height: 34 } },
      /** The 10-foot row. */
      tv: { root: { width: 42, height: 42 } },
    },
    tone: {
      /** The default: a barely-there wash that reads as a recess. */
      neutral: { root: { backgroundColor: 'rgba(255, 255, 255, 0.06)' } },
      /** The row that ADDS something rather than opening it. */
      accent: { root: { backgroundColor: colors.accentSoft } },
    },
  },
  defaults: { size: 'tv', tone: 'neutral' },
});

/** Glyph diameter per size: the well minus its optical padding. */
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
