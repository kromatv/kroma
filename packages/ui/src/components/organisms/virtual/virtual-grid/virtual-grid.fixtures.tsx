export const TINT = ['#3A2E4F', '#1B1524'] as const;

export const TITLES = Array.from({ length: 400 }, (_, at) => ({
  id: at,
  title: `Title ${at + 1}`,
}));

export const TILE_W = 203;

export const ROW_HEIGHT = Math.round((TILE_W * 3) / 2) + 32;
