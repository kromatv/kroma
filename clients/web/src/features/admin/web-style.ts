// The browser-only shapes the kit's vocabulary deliberately does not carry:
// React Native has no `position: fixed`, no viewport unit and no single-axis
// overflow, so a prop for them would silently do nothing on a television. They
// stay real CSS here, and every value they use is still a token.

/** The console's outer frame: one viewport-tall column, two columns from `lg`. */
export const ADMIN_SHELL = 'admin-shell';

/** The permanent left navigation, which exists only from `lg` up. */
export const ADMIN_SIDEBAR = 'admin-sidebar';

/** The phone's pinned bar, which exists only below `lg`. */
export const ADMIN_TOPBAR = 'admin-topbar';

/** A panel that stays put while the column beside it scrolls, from `lg` up. */
export const ADMIN_STICKY_ASIDE = 'admin-sticky-aside';

/** Marks a surface whose whole area presses: a table row, a store card. Set it
 *  as `data-pressable` and pair it with an [`ADMIN_PRESS`] button as the FIRST
 *  child. A kit <Surface> emits it through `dataSet`; a plain element sets the
 *  attribute directly. */
export const PRESSABLE = { pressable: 'true' } as const;

/** The press of a pressable surface: a button covering it from UNDER its
 *  content, so the controls the surface carries stay real buttons beside it. */
export const ADMIN_PRESS = 'admin-press';
