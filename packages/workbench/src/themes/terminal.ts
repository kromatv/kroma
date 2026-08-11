// The full restatement: palette, radii, type scale and families all move at
// once, so anything still amber, round or grotesque is bypassing the
// vocabulary.
//
// EVERY colour, not most of them. A token left out keeps its built-in value,
// and a built-in value is one the cascade owns: it would follow the page's
// ground and put paper borders and paper ink on phosphor.

import { createTheme } from '@kroma/ui/kit';

export const terminal = createTheme({
  colors: {
    bg: '#050807',
    surface1: '#0A120E',
    surface2: '#101B15',
    surface3: '#16241C',
    overlay: 'rgba(8, 14, 11, 0.88)',
    border: 'rgba(232, 255, 242, 0.12)',
    borderStrong: 'rgba(232, 255, 242, 0.22)',
    wash: 'rgba(232, 255, 242, 0.06)',
    tint: '#E8FFF2',
    text: '#E8FFF2',
    textMuted: 'rgba(232, 255, 242, 0.62)',
    textDim: 'rgba(232, 255, 242, 0.45)',
    glyph: '#93A199',
    glyphDim: '#6B7771',
    accent: '#4AF6A3',
    accentHover: '#71FFBE',
    accentPress: '#35D98A',
    accentBright: '#8CFFCB',
    accentInk: '#03130B',
    accentText: '#4AF6A3',
    accentWash: '#48F4A1',
    accentSoft: 'rgba(72, 244, 161, 0.14)',
    accentSoftHover: 'rgba(72, 244, 161, 0.24)',
    success: '#4AF6A3',
    info: '#7FE3FF',
    hdr: '#C9A7FF',
    h265: '#5AF0DE',
    danger: '#FF6B6B',
    dangerHover: '#FF8A8A',
    dangerPress: '#E04F4F',
  },
  // Phosphor on glass has no round corners at all.
  radius: { xs: 0, sm: 0, md: 0, lg: 0, xl: 0, '2xl': 0, pill: 0 },
  fonts: { display: 'Courier New', ui: 'Courier New' },
  typeSpec: {
    hero: { size: 54, ratio: 1.08 },
    h1: { size: 33 },
    h2: { size: 20 },
    title: { size: 18 },
    body: { size: 15, ratio: 1.6 },
    label: { size: 14, weight: '700' },
    meta: { size: 12 },
  },
});
