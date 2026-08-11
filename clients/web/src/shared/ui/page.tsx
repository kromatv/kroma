// The single layout dialect for every page in the app, catalogue and admin
// console alike.

export const PAGE_MAIN = 'min-w-0 px-(--gutter-web) pb-20 pt-9';

export const PAGE_TITLE =
  'font-display text-[clamp(26px,5vw,32px)] font-bold leading-tight tracking-[-.02em]';

export const PAGE_SUBTITLE = 'mt-1.5 text-[14.5px] font-medium text-dim max-sm:text-[15.5px]';

/**
 * The scrim a modal drops over the page, and the lighter one a side drawer
 * does.
 *
 * The one ink in the app deeper than the page ground, and deliberately not a
 * token: a dialog has to read as sitting IN FRONT of the page, which it cannot
 * do while painted in the page's own colour.
 */
export const MODAL_SCRIM = 'fixed inset-0 z-60 bg-[rgba(4,4,6,.66)] backdrop-blur-[3px]';

export const DRAWER_SCRIM = 'fixed inset-0 z-60 bg-[rgba(4,4,6,.6)] backdrop-blur-[2px]';

/** The ground the signed-out screens paint on: the gate, `/join` and the error
 *  page, which are one surface a reader meets in three places. */
export const PAGE_RADIAL = 'radial-gradient(120% 90% at 50% 0%, #15131C, var(--kroma-bg) 70%)';
