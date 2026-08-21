export type ThemeMode = 'system' | 'light' | 'dark';

const COOKIE = 'kroma-theme';

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

const isMode = (value: string | undefined): value is ThemeMode =>
  value !== undefined && (MODES as readonly string[]).includes(value);

export const THEME_MODES = MODES;

/**
 * Stamps the stored ground on `<html>` before the first paint. The site is
 * prerendered to static HTML, so there is no server to read the cookie and put
 * the attribute in the document: without this running synchronously in the
 * head, a visitor who chose light gets a charcoal flash on every navigation.
 */
export const THEME_BOOTSTRAP =
  `try{var m=/(?:^|; )${COOKIE}=(light|dark)/.exec(document.cookie);` +
  `if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`;

/** The stored choice, or `system` for a visitor who never made one. */
export function readMode(): ThemeMode {
  const found = new RegExp(String.raw`(?:^|;\s*)${COOKIE}=([^;]+)`).exec(document.cookie)?.[1];
  return isMode(found) ? found : 'system';
}

/** `system` is stored as ABSENCE of the attribute, which is what leaves
 *  `prefers-color-scheme` in charge. */
export function writeMode(mode: ThemeMode): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is async and Safari has none, and the head bootstrap reads this synchronously
  document.cookie = `${COOKIE}=${mode};path=/;max-age=31536000;samesite=lax`;
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = mode;
}
