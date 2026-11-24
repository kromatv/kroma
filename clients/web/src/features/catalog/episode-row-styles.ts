import { backdropBlur, color, styles, sv } from '@kromatv/ui/kit';

/** The gap between an episode row's still and its text, by breakpoint. */
export const ROW_GAP = { base: 12, md: 20 } as const;

/** The width of an episode row's still, by breakpoint. */
export const STILL_W = { base: 128, md: 200 } as const;

/** The looks the row of an owned episode and the row of a gap share. */
export const episodeRowStyles = styles({
  bold: { fontWeight: '700' },
  dimmed: { opacity: 0.6 },
  frost: backdropBlur(2),
  lift: { ...backdropBlur(2), transform: [{ scale: 1.1 }] },
  scrim: {
    backgroundImage: `linear-gradient(170deg, ${color('black/5')}, ${color('black/45')})`,
  },
});

/** The row of an owned episode, edged once it is watched. */
export const episodeRow = sv({
  base: {
    row: true,
    align: 'center',
    gap: ROW_GAP,
    radius: 'xl',
    p: 14,
    bg: 'white/2.5',
    border: 'white/5',
    _hover: { bg: 'white/6' },
  },
  variants: {
    watched: { true: { border: 'accent/30' }, false: {} },
  },
  defaults: { watched: false },
});

/** The row of a gap the viewer can ask for, tinted once it is picked. */
export const missingRow = sv({
  base: {
    row: true,
    align: 'center',
    gap: ROW_GAP,
    radius: 'xl',
    p: 14,
    bg: 'white/1.5',
    border: 'white/5',
    _hover: { bg: 'white/5' },
  },
  variants: {
    selected: { true: { border: 'accent/45', bg: 'accentWash/8' }, false: {} },
  },
  defaults: { selected: false },
});
