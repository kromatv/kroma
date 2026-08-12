// The browser-only shapes of the side navigation. A row's rest, hover and
// current-page faces are a stylesheet rule because a pointer's hover is a
// pseudo-class and React Native has no spelling for one; the frames around it
// are `position`, `100vh` and single-axis overflow, which it has no spelling
// for either. Every number below comes from the control shell, never from a
// value tuned here.

import { CONTROL } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';
import type { ViewStyle } from 'react-native';

// The web client is a pointer at arm's length and says so once
// (`setEntryDefaults` in router.tsx), so a navigation row wears the same shell
// as every control on the page beside it.
const SHELL = CONTROL.sm;

/** One entry of the navigation, in `../../styles.css`: its rest, hover,
 *  current-page and unreachable faces. */
export const SIDE_NAV_ROW = 'side-nav-row';

/** The column's side padding, and a row's own: the shell's, so a heading, a row
 *  and a footer share one left edge. */
export const SIDE_NAV_GUTTER = SHELL.px;

/** The glyph at the head of a row. */
export const SIDE_NAV_GLYPH = 18;

/** The side padding of the bands above the column (the mark, the actions): the
 *  gutter plus the inset a 40px control's own box already carries, so a mark
 *  and a row's glyph read as one edge. */
export const SIDE_NAV_BAND_X = SIDE_NAV_GUTTER + 8;

/** The navigation column: the rows, their headings and the footer under them.
 *  Grows to its frame so a footer can sit at the bottom edge with `mt="auto"`. */
export const SIDE_NAV_COLUMN: CSSProperties = {
  display: 'flex',
  minHeight: 0,
  flex: 1,
  flexDirection: 'column',
  gap: 2,
  paddingInline: SIDE_NAV_GUTTER,
  paddingTop: 4,
};

/** The scrolling region an aside gives the column. In a phone's sheet the
 *  frame is the drawer's own `<Drawer.Panel>`, which is why it is not the
 *  column's. */
export const SIDE_NAV_FRAME: CSSProperties = {
  display: 'flex',
  minHeight: 0,
  flex: 1,
  flexDirection: 'column',
  overflowY: 'auto',
};

/** A row's name: it takes the width the glyph and the tail leave, and a label
 *  too long for it is cut rather than wrapped onto a second line. */
export const SIDE_NAV_LABEL: CSSProperties = {
  minWidth: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** The tail of a row, held at its far end whatever the name before it measures. */
export const SIDE_NAV_TRAILING: CSSProperties = {
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  gap: 6,
  marginLeft: 'auto',
};

/** The footer's bottom inset. `env()` has no React Native spelling, so a
 *  phone's home indicator is cleared in CSS. */
export const SIDE_NAV_SAFE_BOTTOM = {
  paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom))',
} as unknown as ViewStyle;
