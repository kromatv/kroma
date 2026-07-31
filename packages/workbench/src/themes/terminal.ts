// The full restatement: palette, radii, type scale and families all move at
// once, so anything still amber, round or grotesque is bypassing the
// vocabulary.

import { createTheme } from '@kroma/ui/kit';

export const terminal = createTheme({
  colors: {
    bg: '#050807',
    surface1: '#0A120E',
    surface2: '#101B15',
    surface3: '#16241C',
    overlay: 'rgba(8, 14, 11, 0.88)',
    text: '#E8FFF2',
    textMuted: 'rgba(232, 255, 242, 0.62)',
    textDim: 'rgba(232, 255, 242, 0.45)',
    accent: '#4AF6A3',
    accentHover: '#71FFBE',
    accentBright: '#8CFFCB',
    accentInk: '#03130B',
    accentWash: '#48F4A1',
    accentSoft: 'rgba(72, 244, 161, 0.14)',
    accentSoftHover: 'rgba(72, 244, 161, 0.24)',
  },
  // Phosphor on glass has no round corners.
  radius: { sm: 2, md: 3, lg: 4, xl: 5, '2xl': 6 },
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
