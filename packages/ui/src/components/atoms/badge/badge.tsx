// <Badge>: the small quality / status pill (4K, HDR, H.265, FR, Disponible).
// Text only, never emoji.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { sv, type Variant } from '#ui/core';

type BadgeTone = Variant<typeof badgeVariants, 'tone'>;

const badgeVariants = sv({
  slots: {
    root: { self: 'flex-start', radius: 6 },
    label: { font: 'ui', fontWeight: '700' },
  },
  variants: {
    /** Each tone is a tinted wash of its own hue at 16% — the `/NN` alpha
     * suffix, resolved at declaration time because no target can compute
     * color-mix() (old webOS cannot, React Native cannot). */
    tone: {
      '4K': { root: { bg: 'accentSoft' }, label: { color: 'accent' } },
      HDR: { root: { bg: 'hdr/16' }, label: { color: 'hdr' } },
      'H.265': { root: { bg: 'h265/16' }, label: { color: 'h265' } },
      success: { root: { bg: 'success/16' }, label: { color: 'success' } },
      info: { root: { bg: 'info/16' }, label: { color: 'info' } },
      danger: { root: { bg: 'danger/16' }, label: { color: 'danger' } },
      warning: { root: { bg: 'accentSoft' }, label: { color: 'accent' } },
      neutral: { root: { bg: 'white/8' }, label: { color: 'text/85' } },
    },
    size: {
      sm: { root: { py: 4, px: 9 }, label: { fontSize: 11, letterSpacing: 0.44 } },
      tv: { root: { py: 5, px: 11, radius: 7 }, label: { fontSize: 13, letterSpacing: 0.26 } },
    },
  },
  defaults: { tone: '4K', size: 'sm' },
});

/** Maps the catalogue's quality strings ("4K", "HDR", "H.265", ...) to a
 * tone. Anything unrecognised gets the amber treatment. */
function qualityTone(badge: string): BadgeTone {
  if (badge === 'HDR') return 'HDR';
  if (badge === 'H.265') return 'H.265';
  return '4K';
}

interface BadgeProps {
  tone?: BadgeTone;
  size?: Variant<typeof badgeVariants, 'size'>;
  children?: ReactNode;
}

function Badge({ tone = '4K', size = 'sm', children }: Readonly<BadgeProps>) {
  // The catalogue can hand over a quality string the design never named;
  // anything unrecognised gets the neutral treatment.
  const known = badgeVariants.options.tone.includes(tone) ? tone : 'neutral';
  const s = badgeVariants({ tone: known, size });
  return (
    <Box style={s.root}>
      <Txt style={s.label}>{children ?? tone}</Txt>
    </Box>
  );
}

export type { BadgeProps, BadgeTone };
export { Badge, badgeVariants, qualityTone };
