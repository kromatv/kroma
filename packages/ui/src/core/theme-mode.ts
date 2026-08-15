import { deviceStorage } from '@kroma/core';
import { Appearance } from 'react-native';
import { webDocument } from '#ui/lib/dom';
import { WEB } from '#ui/lib/platform';
import { KROMA, KROMA_LIGHT, setTheme } from './theme.ts';
import { CSS_COLORS } from './tokens/css-palette.ts';

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_COOKIE = 'kroma-theme';

const THEME_KEY = 'kroma:theme';

const MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];

export const isThemeMode = (v: unknown): v is ThemeMode =>
  typeof v === 'string' && (MODES as readonly string[]).includes(v);

// A cookie on the web because the SERVER has to read it and stamp the ground
// before the page is sent; device storage where there is no server.

const COOKIE = new RegExp(String.raw`(?:^|;\s*)${THEME_COOKIE}=([^;]+)`);

function stored(jar?: string): string | null {
  if (WEB) return COOKIE.exec(jar ?? webDocument()?.cookie ?? '')?.[1] ?? null;
  try {
    return deviceStorage()?.getItem(THEME_KEY) ?? null;
  } catch {
    return null; /* storage unavailable */
  }
}

function store(mode: ThemeMode): void {
  if (WEB) {
    const doc = webDocument();
    if (doc) doc.cookie = `${THEME_COOKIE}=${mode};path=/;max-age=31536000;samesite=lax`;
    return;
  }
  try {
    deviceStorage()?.setItem(THEME_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}

/** The ground a mode resolves to right now. Anything `system` cannot be told
 *  about reads as dark, the product's default ground. */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

export function readMode(cookie?: string): ThemeMode {
  const found = stored(cookie);
  return isThemeMode(found) ? found : 'system';
}

/**
 * Stamps the ground on the document, which on a browser is the whole switch:
 * every colour is a custom property, so `[data-theme]` repaints without a
 * re-render, and `system` is stamped as ABSENCE for the media query to answer.
 * React Native has no cascade, so there the store moves instead.
 */
export function applyMode(mode: ThemeMode): void {
  const root = webDocument()?.documentElement;
  if (root) {
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;
  }
  if (!CSS_COLORS) setTheme(resolveMode(mode) === 'light' ? KROMA_LIGHT : KROMA);
}

export function writeMode(mode: ThemeMode): void {
  store(mode);
  applyMode(mode);
}
