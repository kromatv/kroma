import { createTheme, KROMA_LIGHT, type ThemeOverrides } from '#ui/core/theme-create';

const rounder: ThemeOverrides['radius'] = {
  compact: 6,
  badge: 10,
  control: 16,
  panel: 18,
  photo: 20,
  search: 24,
  tile: 22,
  row: 24,
  dialog: 30,
};

/** KROMA Kids on its night ground: a sky accent over deep blue, and rounder
 *  corners. A Kids session wears it on every surface (ACCT-136). */
export const KROMA_KIDS = createTheme({
  colors: {
    bg: '#0D1130',
    surface1: '#151A3D',
    surface2: '#1E244E',
    surface3: '#283062',
    overlay: 'rgba(21, 26, 61, 0.88)',
    border: 'rgba(255, 255, 255, 0.1)',
    borderStrong: 'rgba(255, 255, 255, 0.16)',
    accent: '#5CC8FF',
    accentHover: '#85D6FF',
    accentPress: '#3DB3EE',
    accentBright: '#9EE0FF',
    accentPale: '#D3F0FF',
    accentText: '#5CC8FF',
    accentWash: '#55BDF5',
    accentSoft: 'rgba(85, 189, 245, 0.18)',
    accentSoftHover: 'rgba(85, 189, 245, 0.28)',
  },
  radius: rounder,
});

/** {@link KROMA_KIDS} on a paper ground. */
export const KROMA_KIDS_LIGHT = createTheme(
  {
    colors: {
      bg: '#F2F6FF',
      surface1: '#FFFFFF',
      surface2: '#E6ECFA',
      surface3: '#D9E1F5',
      overlay: 'rgba(242, 246, 255, 0.9)',
      accent: '#5CC8FF',
      accentHover: '#3DB3EE',
      accentPress: '#2A9FD9',
      accentBright: '#85D6FF',
      accentPale: '#D3F0FF',
      accentText: '#0B5E8C',
      accentWash: '#1A7DB8',
      accentSoft: 'rgba(26, 125, 184, 0.16)',
      accentSoftHover: 'rgba(26, 125, 184, 0.26)',
    },
    radius: rounder,
  },
  KROMA_LIGHT,
);
