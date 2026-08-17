// One file keyed on Platform.OS, not a `.ts`/`.web.ts` pair: the native half is
// `null`, a legal value, so a misresolved import would fail silently.

import { WEB } from '#ui/lib/platform';
import { type ColorToken, colors, splitAlpha } from './colors';
import { cssVar } from './css-var';
import { type ShadowToken, shadow } from './effects';

// An engine below M49 has no custom properties at all, so a token written as
// `var(--kroma-…)` resolves to nothing there and the colour is simply lost. For
// this file the deep tier is therefore the same case as native: no cascade to
// read a token back out of, so the literal values are used instead.
const CASCADE =
  WEB && (globalThis as { __KROMA_DEEP_TIER__?: boolean }).__KROMA_DEEP_TIER__ !== true;

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
export const CSS_COLORS: Readonly<Record<ColorToken, string>> | null = CASCADE
  ? vars(colors, cssVar)
  : null;

export const CSS_SHADOWS: Readonly<Record<ShadowToken, string>> | null = CASCADE
  ? vars(shadow, (k) => `--shadow-${k}`)
  : null;

/**
 * The translucent tokens, as the two properties the build emits for each. Both
 * halves stay in the cascade: a token's alpha differs between the grounds.
 */
export const CSS_FADED: Readonly<Record<string, { color: string; opacity: string }>> = CASCADE
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
