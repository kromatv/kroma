// The single layout dialect for every page in the app, catalogue and admin
// console alike. These are class names rather than <Box> props because neither
// shape has a React Native spelling - a landmark element, a fluid clamp(), a
// fixed position, a backdrop filter - so the rules live in `../../styles.css`
// and this file names them.

/** The frame every screen's `<main>` sits in: the fluid `--gutter-web` side
 *  padding and the app's vertical rhythm. */
export const PAGE_MAIN = 'page-main';

/**
 * The scrim a modal drops over the page.
 *
 * Its ink is the one colour in the app deeper than the page ground, and
 * deliberately not a token: a dialog has to read as sitting IN FRONT of the
 * page, which it cannot do while painted in the page's own colour.
 */
export const MODAL_SCRIM = 'modal-scrim';

/** The ground the signed-out screens paint on: the gate, `/join` and the error
 *  page, which are one surface a reader meets in three places. */
export const PAGE_RADIAL =
  'radial-gradient(120% 90% at 50% 0%, var(--kroma-surface-1), var(--kroma-bg) 70%)';
