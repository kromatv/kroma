type SurfaceWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * THE overlay ladder: how wide a `<Dialog>` or a `<Drawer>` may be, by the
 * densest thing it holds rather than by a number a call site invented. A panel
 * that picks its own width is how eight of them ended up between 460 and 768
 * with no rule telling them apart, and how a list of rows that each carry a
 * hint came to wrap onto three lines beside half a screen of nothing.
 *
 * | `xs` | a rail: a column of destinations, nothing beside anything |
 * | `sm` | a question and its answer |
 * | `md` | a form: fields stacked, one control per line |
 * | `lg` | rows that each carry a hint, or a form beside a list |
 * | `xl` | a grid, or a browser |
 *
 * Read it where the number itself is needed (a virtualised row measuring
 * itself against the panel); write the STEP everywhere else.
 */
export const SURFACE_WIDTH: Record<SurfaceWidth, number> = {
  xs: 320,
  sm: 440,
  md: 600,
  lg: 760,
  xl: 960,
};

/** The gutter a `<Dialog>`'s three bands share, and what its `pad` defaults to. */
export const DIALOG_PAD = 40;

export type { SurfaceWidth };
