/** The browser has no native Menu switch. */
export function createMenuKeys() {
  return { hold: () => () => {} };
}
