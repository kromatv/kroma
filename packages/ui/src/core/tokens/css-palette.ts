// One file keyed on Platform.OS, not a `.ts`/`.web.ts` pair: the native half is
// `null`, a legal value, so a misresolved import would fail silently.

import { type ColorToken, colors, splitAlpha } from '#ui/core/tokens/colors';
import { cssName, cssVar } from '#ui/core/tokens/css-var';
import { type ShadowToken, shadow } from '#ui/core/tokens/effects';
import { type Radius, type RadiusToken, radius } from '#ui/core/tokens/layout';
import {
  type FontToken,
  fonts,
  type RoleStyle,
  type TypeRole,
  type TypeSpec,
  typeSpec,
} from '#ui/core/tokens/typography';
import { WEB } from '#ui/lib/platform';

// An engine below M49 has no custom properties at all, so a token written as
// `var(--kroma-…)` resolves to nothing there and the colour is simply lost. For
// this file the deep tier is therefore the same case as native: no cascade to
// read a token back out of, so the literal values are used instead.
const CASCADE =
  WEB && (globalThis as { __KROMA_DEEP_TIER__?: boolean }).__KROMA_DEEP_TIER__ !== true;

/** A token group read back through the cascade: every value a `var()` of the
 *  property `name` gives its key. */
export const customProperties = <K extends string>(
  group: Record<K, string | number>,
  name: (key: string) => string,
): Readonly<Record<K, `var(${string})`>> =>
  Object.freeze(
    Object.fromEntries(Object.keys(group).map((k) => [k, `var(${name(k)})` as const])),
  ) as Record<K, `var(${string})`>;

/**
 * The palette as CSS custom properties, or null where there is no cascade: a
 * browser repaints on `[data-theme]` alone, React Native moves the theme store.
 */
export const CSS_COLORS: Readonly<Record<ColorToken, string>> | null = CASCADE
  ? customProperties(colors, cssVar)
  : null;

export const CSS_SHADOWS: Readonly<Record<ShadowToken, string>> | null = CASCADE
  ? customProperties(shadow, (k) => `--shadow-${k}`)
  : null;

/**
 * The radius scale as the custom properties the token sheet already publishes,
 * or null where React Native lays out with the numbers.
 */
export const CSS_RADIUS: Readonly<Record<RadiusToken, Radius>> | null = CASCADE
  ? customProperties(radius, (k) => `--radius-${k}`)
  : null;

/** The families as the properties the token sheet publishes them under. */
export const CSS_FONTS: Readonly<Record<FontToken, string>> | null = CASCADE
  ? customProperties(fonts, (k) => `--font-${k}`)
  : null;

type TypePart = 'family' | 'weight' | 'size' | 'line' | 'spacing';

/** The custom property one part of a type role is published under:
 *  `--type-card-title-size`. */
export const typeProperty = (role: string, part: TypePart) => `--type-${cssName(role)}-${part}`;

/** A role as the style that reads every part of it back through the cascade. */
export function typeProperties(role: string, spec: TypeSpec): RoleStyle {
  const at = (part: TypePart) => `var(${typeProperty(role, part)})`;
  return {
    fontFamily: at('family'),
    fontWeight: at('weight'),
    fontSize: at('size'),
    lineHeight: at('line'),
    ...(spec.em === undefined ? null : { letterSpacing: at('spacing') }),
    ...(spec.uppercase ? { textTransform: 'uppercase' as const } : null),
  };
}

/** Every role of a spec read through the cascade. */
export const typeCascade = <R extends string>(
  spec: Readonly<Record<R, TypeSpec>>,
): Readonly<Record<R, RoleStyle>> =>
  Object.freeze(
    Object.fromEntries(
      (Object.entries(spec) as [R, TypeSpec][]).map(([role, s]) => [role, typeProperties(role, s)]),
    ) as Record<R, RoleStyle>,
  );

export const CSS_TYPE: Readonly<Record<TypeRole, RoleStyle>> | null = CASCADE
  ? typeCascade(typeSpec)
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
