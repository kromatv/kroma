import { splitAlpha, withAlpha } from '#ui/core/tokens/colors';
import { typeProperty } from '#ui/core/tokens/css-palette';
import { cssName, cssVar } from '#ui/core/tokens/css-var';
import { fontStack, type RoleStyle } from '#ui/core/tokens/typography';
import type { Theme } from '#ui/core/theme-create';

// What a theme RESTATES: `paint` leaves an untouched token as its own property,
// so anything that is not a `var(...)` is a value this theme decided.
export function restated(
  theme: Theme,
  steps: Map<string, readonly string[]>,
): readonly (readonly [string, string])[] {
  const colors = Object.entries(theme.colors)
    .filter(([, value]) => !value.startsWith('var('))
    .flatMap(([token, value]) => [
      [cssVar(token), value] as const,
      ...derived(token, value, steps.get(cssName(token)) ?? []),
    ]);
  const shadows = Object.entries(theme.shadow)
    .filter(([, value]) => !value.startsWith('var('))
    .map(([token, value]) => [`--shadow-${token}`, value] as const);
  const radii = Object.entries(theme.radius)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([token, value]) => [`--radius-${token}`, `${value}px`] as const);
  const fonts = Object.entries(theme.fonts)
    .filter(([, value]) => !value.startsWith('var('))
    .map(([token, value]) => [`--font-${token}`, fontStack(value)] as const);
  const roles = Object.entries(theme.type)
    .filter(([, style]) => typeof style.fontSize === 'number')
    .flatMap(([role, style]) => roleProperties(role, style));
  return [...colors, ...shadows, ...radii, ...fonts, ...roles];
}

// Consume each complete identifier once. Matching the prefix and suffix together
// retries long hyphenated names at every nested `--kroma-` prefix.
export function collectSteps(css: string, found: Map<string, string[]>): void {
  for (const match of css.matchAll(/--[a-z0-9_-]+/g)) {
    const property = match[0];
    if (!property.startsWith('--kroma-')) continue;
    if (
      !css
        .slice(match.index + property.length)
        .trimStart()
        .startsWith(':')
    )
      continue;
    const separator = property.lastIndexOf('-');
    const name = property.slice('--kroma-'.length, separator);
    const step = property.slice(separator + 1);
    if (!name || !/^[a-z0-9-]+$/.test(name)) continue;
    if (step !== 'opaque' && step !== 'alpha' && !/^\d+(?:_\d+)?$/.test(step)) continue;
    const steps = found.get(name) ?? [];
    if (!steps.includes(step)) steps.push(step);
    found.set(name, steps);
  }
}

// A cross-origin sheet answers `cssRules` with a SecurityError; it holds none of
// ours, so it is skipped rather than read.
export function rulesOf(sheet: CSSStyleSheet): readonly CSSRule[] {
  try {
    return [...sheet.cssRules];
  } catch {
    return [];
  }
}

function derived(token: string, value: string, steps: readonly string[]) {
  const faded = splitAlpha(value);
  return steps.map((step) => {
    if (step === 'opaque') return [`${cssVar(token)}-opaque`, faded.color] as const;
    if (step === 'alpha') return [`${cssVar(token)}-alpha`, String(faded.opacity)] as const;
    const alpha = Number(step.replace('_', '.'));
    return [cssVar(token, step), withAlpha(value, alpha / 100)] as const;
  });
}

// A restated role, derived to px by the theme, under the properties every
// untouched role already reads.
function roleProperties(role: string, style: RoleStyle): (readonly [string, string])[] {
  const family = style.fontFamily ?? '';
  const out: (readonly [string, string])[] = [
    [typeProperty(role, 'family'), family.startsWith('var(') ? family : fontStack(family)],
    [typeProperty(role, 'weight'), String(style.fontWeight)],
    [typeProperty(role, 'size'), `${style.fontSize}px`],
    [typeProperty(role, 'line'), `${style.lineHeight}px`],
  ];
  if (style.letterSpacing !== undefined) {
    out.push([typeProperty(role, 'spacing'), `${style.letterSpacing}px`]);
  }
  return out;
}
