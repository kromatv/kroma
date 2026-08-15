export const TINT = ['#3A2E4F', '#1B1524'] as const;

export const TITLES = Array.from({ length: 400 }, (_, at) => ({
  id: at,
  title: `Title ${at + 1}`,
}));

export const TILE_MIN = 203;

export const POSTER_RATIO = 3 / 2;

// What the preview assumes until it has measured its own canvas: the design's
// stage inside the story's own padding, so an unmeasured render is the 8-column
// grid the browse screens draw.
export const PREVIEW_W = 1840;
