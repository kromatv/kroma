// <Badge>: the small quality / status pill (4K, HDR, H.265, FR, Disponible).
// Text only, never emoji.

import type { ReactNode } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Txt } from '#ui/components/atoms/text';
import { sv } from '#ui/lib/sv';
import { colors, fonts } from '#ui/lib/tokens';

type BadgeTone = '4K' | 'HDR' | 'H.265' | 'success' | 'info' | 'neutral';

const badgeVariants = sv({
  slots: {
    root: { alignSelf: 'flex-start', borderRadius: 6 },
    label: { fontFamily: fonts.ui, fontWeight: '700' },
  },
  variants: {
    /** Each tone is a tinted wash of its own hue at 16%, which is why the
     * backgrounds are literal rgba rather than a token: they are derived
     * colours, and no target can compute color-mix() (old webOS cannot,
     * React Native cannot). */
    tone: {
      '4K': { root: { backgroundColor: colors.accentSoft }, label: { color: colors.accent } },
      HDR: {
        root: { backgroundColor: 'rgba(199, 146, 234, 0.16)' },
        label: { color: colors.hdr },
      },
      'H.265': {
        root: { backgroundColor: 'rgba(95, 211, 196, 0.16)' },
        label: { color: colors.h265 },
      },
      success: {
        root: { backgroundColor: 'rgba(70, 208, 141, 0.16)' },
        label: { color: colors.success },
      },
      info: {
        root: { backgroundColor: 'rgba(134, 168, 255, 0.16)' },
        label: { color: colors.info },
      },
      neutral: {
        root: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
        label: { color: 'rgba(244, 243, 240, 0.85)' },
      },
    },
    size: {
      sm: {
        root: { paddingVertical: 4, paddingHorizontal: 9 },
        label: { fontSize: 11, letterSpacing: 0.44 },
      },
      tv: {
        root: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: 7 },
        label: { fontSize: 13, letterSpacing: 0.26 },
      },
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
  size?: 'sm' | 'tv';
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
