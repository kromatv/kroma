// The browser-only shapes the kit's vocabulary deliberately does not carry:
// React Native has no `position: fixed`, no viewport unit and no single-axis
// overflow, so a prop for them would silently do nothing on a television. They
// stay real CSS here, and every value they use is still a token.

import type { CSSProperties } from 'react';

/** A drawer's body: the one region that scrolls when its content overflows.
 *  `minHeight: 0` is what lets a flex child shrink enough to scroll at all. */
export const SCROLL_PANE: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto' };

/** The console's outer frame: one viewport-tall column, two columns from `lg`. */
export const ADMIN_SHELL = 'admin-shell';

/** The permanent left navigation, which exists only from `lg` up. */
export const ADMIN_SIDEBAR = 'admin-sidebar';

/** The scrolling middle of the sidebar, above the pinned status card. */
export const ADMIN_SIDEBAR_NAV = 'admin-sidebar-nav';

/** The phone's pinned bar, which exists only below `lg`. */
export const ADMIN_TOPBAR = 'admin-topbar';

/** One entry in the navigation, rest / hover / current page. */
export const ADMIN_NAV_LINK = 'admin-nav-link';

/** A panel that stays put while the column beside it scrolls, from `lg` up. */
export const ADMIN_STICKY_ASIDE = 'admin-sticky-aside';

/** The heading band of an aligned table (see `./table.tsx`). */
export const ADMIN_TABLE_HEAD = 'admin-table-head';

/** One record of an aligned table, pressable or not. */
export const ADMIN_TABLE_ROW = 'admin-table-row';

/** The press of a pressable row: a button covering the row from under its
 *  cells, so the row's own controls stay real buttons beside it. */
export const ADMIN_TABLE_PRESS = 'admin-table-press';
