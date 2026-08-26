import { CONTROL, type StyleDecl, svFor, typeSpec } from '@kroma/ui/kit';
import type { ViewStyle } from 'react-native';
import { safeAreaBottom } from '#web/shared/lib/safe-area';

const SHELL = CONTROL.sm;

const RHYTHM = 2;

const LABEL_LINE = Math.round(typeSpec.label.size * typeSpec.label.ratio);

export const SIDE_NAV_GUTTER = SHELL.px;

export const SIDE_NAV_GLYPH = 18;

// How far a 40px icon button's glyph already sits inside its own box, so a mark
// beside the bands lines up with a row's glyph rather than with the row's edge.
const GLYPH_INSET = 8;

export const SIDE_NAV_BAND_X = SIDE_NAV_GUTTER + GLYPH_INSET;

/**
 * The glyph and the name carry their own ink, because React Native does not
 * cascade a colour into a child the way `color` does in CSS.
 */
export const sideNavRow = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  glyph: { color: string };
}>()({
  slots: {
    root: {
      row: true,
      align: 'center',
      gap: SHELL.gap,
      minH: SHELL.height,
      my: RHYTHM / 2,
      px: SHELL.px,
      py: Math.round((SHELL.height - LABEL_LINE) / 2),
      radius: SHELL.radius,
      _hover: { bg: 'tint/4' },
      _disabled: { opacity: 0.5 },
    },
    label: { flex: 1, minW: 0, color: 'textMuted', _hover: { color: 'text' } },
    glyph: { color: 'textMuted', _hover: { color: 'text' } },
  },
  variants: {
    current: {
      true: {
        root: { bg: 'accentSoft', _hover: { bg: 'accentSoftHover' } },
        label: { color: 'accentText', _hover: { color: 'accentText' } },
        glyph: { color: 'accentText', _hover: { color: 'accentText' } },
      },
    },
  },
  defaults: { current: false },
});

export const SIDE_NAV_FRAME: ViewStyle = { flex: 1, minHeight: 0 };

export const SIDE_NAV_SAFE_BOTTOM: ViewStyle = safeAreaBottom(28);
