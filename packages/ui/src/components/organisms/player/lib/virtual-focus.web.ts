/** No-op on the web: there is no OS focus engine to opt out of, and the player
 * already routes every key itself. See virtual-focus.ts for the native half. */
export const VIRTUAL_FOCUS = {} as const;
