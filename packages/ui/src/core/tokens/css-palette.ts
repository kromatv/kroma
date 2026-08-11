// One file keyed on Platform.OS, not a `.ts`/`.web.ts` pair: the native half is
// `null`, a legal value, so a misresolved import would fail silently.

import { Platform } from 'react-native';
import { type ColorToken, colors, splitAlpha } from './colors';
import { cssVar } from './css-var';
import { type ShadowToken, shadow } from './effects';

const WEB = Platform.OS === 'web';

const vars = <K extends string>(
  group: Record<K, string>,
  name: (key: string) => string,
): Readonly<Record<K, string>> =>
  Object.freeze(
    Object.fromEntries(Object.keys(group).map((k) => [k, `var(${name(k)})`])),
  ) as Record<K, string>;

/**
 * The palette as CSS custom properties, or null where there is no cascade: a
 * browser repaints on `[data-theme]` alone, React Native moves the theme store.
 */
export const CSS_COLORS: Readonly<Record<ColorToken, string>> | null = WEB
  ? vars(colors, cssVar)
  : null;

export const CSS_SHADOWS: Readonly<Record<ShadowToken, string>> | null = WEB
  ? vars(shadow, (k) => `--shadow-${k}`)
  : null;

/**
 * The translucent tokens, as the two properties the build emits for each. Both
 * halves stay in the cascade: a token's alpha differs between the grounds.
 */
export const CSS_FADED: Readonly<Record<string, { color: string; opacity: string }>> = WEB
  ? Object.freeze(
      Object.fromEntries(
        Object.entries(colors)
          .filter(([, value]) => splitAlpha(value).opacity < 1)
          .map(([token]) => [
            token,
            { color: `var(${cssVar(token)}-opaque)`, opacity: `var(${cssVar(token)}-alpha)` },
          ]),
      ),
    )
  : {};
