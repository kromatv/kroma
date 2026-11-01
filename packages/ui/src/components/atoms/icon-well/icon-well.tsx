import { sv, useSv, type Variant } from '#ui/core';
// <IconWell>: a glyph sunk into a rounded, tinted square, or art filling that same
// square. The leading mark of a settings row, a server in a list, a menu entry.

import { Box } from '#ui/components/atoms/box';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Img } from '#ui/components/atoms/img';

type IconWellSize = Variant<typeof iconWellVariants, 'size'>;
type IconWellTone = Variant<typeof iconWellVariants, 'tone'>;

const iconWellVariants = sv({
  slots: {
    root: { center: true, shrink: 0, radius: 'xl', overflow: 'hidden' },
  },
  variants: {
    size: {
      xs: { root: { w: 30, h: 30, radius: 'sm' } },
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

const GLYPH = { xs: 16, sm: 17, tv: 20 } as const;
const ART_FADE_MS = 120;

interface IconWellProps {
  name: IconName;
  size?: IconWellSize;
  tone?: IconWellTone;
  /** Art that fills the well, such as a module's icon. The glyph stays as what shows
   *  while it loads and if it fails. */
  src?: string | null;
}

function IconWell({ name, size = 'tv', tone = 'neutral', src }: Readonly<IconWellProps>) {
  const iconWellVariantsScoped = useSv(iconWellVariants);

  const s = iconWellVariantsScoped({ size, tone });
  const glyph = (
    <Icon name={name} size={GLYPH[size]} color={tone === 'accent' ? 'accent' : 'textMuted'} />
  );
  const behindArt = (
    <Box fill center>
      {glyph}
    </Box>
  );
  return (
    <Box style={s.root}>
      {src ? (
        <Img
          src={src}
          fill
          noCrossFade
          duration={ART_FADE_MS}
          placeholder={behindArt}
          fallback={behindArt}
        />
      ) : (
        glyph
      )}
    </Box>
  );
}

export type { IconWellProps, IconWellSize, IconWellTone };
export { IconWell, iconWellVariants };
