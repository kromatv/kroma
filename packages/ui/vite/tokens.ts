import { fileURLToPath } from 'node:url';
import { sourceRoots } from '../bundler/index.ts';
import { colors, lightColors, splitAlpha, withAlpha } from '../src/core/tokens/colors.ts';
import { cssName, cssVar } from '../src/core/tokens/css-var.ts';
import {
  glow,
  lightShadow,
  motion,
  RING_GAP,
  RING_WIDTH,
  shadow,
  WASH_ALPHA,
} from '../src/core/tokens/effects.ts';
import { gutter, radius, rhythm, space } from '../src/core/tokens/layout.ts';
import { fonts, SELF_HOSTED, tracking, typeSpec } from '../src/core/tokens/typography.ts';
import { ADMIN_TABLE } from '../src/styles/admin-table.ts';
import { MOTION } from '../src/styles/motion.ts';
import { PAGE } from '../src/styles/page.ts';
import { RESET } from '../src/styles/reset.ts';
import { sheetCss } from '../src/styles/sheet.ts';
import { scanAlphas } from './alpha-scan.ts';

type ColorToken = keyof typeof colors;

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const UTILITY: Partial<Record<ColorToken, string>> = { textMuted: 'muted', textDim: 'dim' };

const indent = (line: string) => `  ${line}`;

const rule = (selector: string, lines: string[]) =>
  `${selector} {\n${lines.map(indent).join('\n')}\n}`;

const media = (query: string, body: string) =>
  `@media ${query} {\n${body.split('\n').map(indent).join('\n')}\n}`;

const palette = (p: Record<ColorToken, string>) =>
  Object.entries(p).map(([k, v]) => `--kroma-${cssName(k as ColorToken)}: ${v.toLowerCase()};`);

export const KNOWN_COLOR_NAMES: ReadonlySet<string> = new Set(Object.keys(colors));

// Anchored to the repo, not to the working directory: a build runs from the app it builds.
const REPO = fileURLToPath(new URL('../../..', import.meta.url));

export const SOURCE_ROOTS = sourceRoots(REPO);

// Derived from the accent wash at runtime, so no source spells them out for the scan.
const DERIVED = Object.values(WASH_ALPHA).map((step) => `accentWash/${step}`);

const split = (combo: string) => combo.split('/') as [string, string];

const alphaVars = (combos: ReadonlySet<string>, p: Record<ColorToken, string>) =>
  [...combos]
    .map(split)
    .filter(([token]) => token in p)
    .sort(([aToken, aAlpha], [bToken, bAlpha]) =>
      aToken === bToken ? Number(aAlpha) - Number(bAlpha) : aToken.localeCompare(bToken),
    )
    .map(
      ([token, alpha]) =>
        `${cssVar(token, alpha)}: ${withAlpha(p[token as ColorToken], Number(alpha) / 100)};`,
    );

const fadedVars = (p: Record<ColorToken, string>) =>
  Object.entries(p).flatMap(([k, v]) => {
    const { color, opacity } = splitAlpha(v);
    if (opacity === 1) return [];
    return [`${cssVar(k)}-opaque: ${color};`, `${cssVar(k)}-alpha: ${opacity};`];
  });

const ALIASES = [
  '--surface-page: var(--kroma-bg);',
  '--surface-card: var(--kroma-surface-1);',
  '--surface-raised: var(--kroma-surface-2);',
  '--text-body: var(--kroma-text);',
  '--text-secondary: var(--kroma-text-muted);',
  '--text-tertiary: var(--kroma-text-dim);',
  '--brand: var(--kroma-accent);',
  '--brand-ink: var(--kroma-accent-ink);',
];

const stack = (family: string) =>
  SELF_HOSTED.includes(family) ? `"${family}", system-ui, sans-serif` : family;

const typography = () => [
  ...Object.entries(fonts).map(([k, v]) => `--font-${k}: ${stack(v)};`),
  ...Object.entries(typeSpec).map(
    ([k, s]) => `--type-${kebab(k)}: ${s.weight} ${s.size}px / ${s.ratio} var(--font-${s.family});`,
  ),
  ...Object.entries(tracking).map(([k, v]) => `--tracking-${kebab(k)}: ${v}em;`),
];

const spacing = () => [
  ...Object.entries(space).map(([k, v]) => `--space-${k}: ${v}px;`),
  ...Object.entries(gutter).map(([k, v]) => `--gutter-${k}: ${v}px;`),
  `--row-gap: ${rhythm.rowGap}px;`,
  `--card-w: ${rhythm.cardWidth}px;`,
];

const effects = () => [
  ...Object.entries(radius).map(([k, v]) => `--radius-${k}: ${v}px;`),
  `--ring-width: ${RING_WIDTH}px;`,
  `--ring-gap: ${RING_GAP}px;`,
  `--ring-outline: ${RING_WIDTH}px solid var(--kroma-accent);`,
  ...Object.entries(glow).map(([k, v]) => `--glow-${k}: ${v};`),
  `--ease-out: cubic-bezier(${motion.bezier.out.join(', ')});`,
  `--ease-spring: cubic-bezier(${motion.bezier.spring.join(', ')});`,
  ...Object.entries(motion.duration).map(([k, v]) => `--dur-${k}: ${v / 1000}s;`),
  `--press-scale: ${motion.pressScale};`,
  `--hover-lift: ${motion.focusLift}px;`,
];

/** Every design token as CSS custom properties, grounded by `data-theme`. */
export function tokensCss(roots: readonly string[] = SOURCE_ROOTS): string {
  const alphas = new Set([...scanAlphas(roots, KNOWN_COLOR_NAMES), ...DERIVED]);

  const ground = (p: Record<ColorToken, string>, elevation: Record<string, string>) => [
    ...palette(p),
    ...alphaVars(alphas, p),
    ...fadedVars(p),
    ...Object.entries(elevation).map(([k, v]) => `--shadow-${k}: ${v};`),
  ];

  const light = ground(lightColors, lightShadow);

  return [
    rule(':root', [...ALIASES, ...typography(), ...spacing(), ...effects()]),
    // Unrooted attribute selectors, so any subtree can pin its own ground; light
    // comes last so it wins at equal specificity.
    rule(':root,\n[data-theme="dark"]', ground(colors, shadow)),
    rule('[data-theme="light"]', light),
    // `:not([data-theme])` only: the query must not repaint a root that already said dark.
    media('(prefers-color-scheme: light)', rule(':root:not([data-theme])', light)),
  ].join('\n\n');
}

/** The Tailwind v4 bridge: `bg-accent`, `text-muted`, `rounded-lg`, `shadow-card`. */
export function themeCss(): string {
  return rule('@theme', [
    ...(Object.keys(colors) as ColorToken[]).map(
      (k) => `--color-${UTILITY[k] ?? cssName(k)}: var(--kroma-${cssName(k)});`,
    ),
    `--font-sans: "${fonts.ui}", system-ui, sans-serif;`,
    `--font-display: "${fonts.display}", system-ui, sans-serif;`,
    ...Object.entries(radius).map(([k, v]) => `--radius-${k}: ${v}px;`),
    ...Object.entries(shadow).map(([k, v]) => `--shadow-${k}: ${v};`),
    `--ease-out: cubic-bezier(${motion.bezier.out.join(', ')});`,
    `--ease-spring: cubic-bezier(${motion.bezier.spring.join(', ')});`,
  ]);
}

const SUBSETS = {
  latin:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext':
    'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
};

const FONT_DIR = fileURLToPath(new URL('../src/assets/fonts/', import.meta.url));

const slug = (family: string) => family.toLowerCase().replace(/\s+/g, '-');

const fontFile = (family: string, subset: string) => `${FONT_DIR}${slug(family)}-${subset}.woff2`;

/**
 * The woff2 a first paint cannot start without, absolute on disk: the latin
 * subset of each self-hosted family. `latin-ext` is left out because nothing on
 * a first screen is written in it, and a preload the page does not use is a
 * console warning and wasted bytes on a television's link.
 */
export const FIRST_PAINT_FONTS: readonly string[] = SELF_HOSTED.map((family) =>
  fontFile(family, 'latin'),
);

/**
 * The two typefaces, self-hosted: a KROMA install can have no route to a CDN.
 *
 * Absolute paths, so Vite emits the woff2 from wherever the importing
 * stylesheet lives.
 */
export function fontsCss(display: FontDisplay = 'optional'): string {
  return SELF_HOSTED.flatMap((family) =>
    Object.entries(SUBSETS).map(([subset, range]) =>
      rule('@font-face', [
        `font-family: "${family}";`,
        'font-style: normal;',
        'font-weight: 400 800;',
        `font-display: ${display};`,
        `src: url("${fontFile(family, subset)}") format("woff2");`,
        `unicode-range: ${range};`,
      ]),
    ),
  ).join('\n\n');
}

/** Keyframes the components animate with, on every browser target. */
export const motionCss = () => sheetCss(MOTION);

/** The UA stylesheet undone, and nothing that assumes a page: what a target
 *  needs whatever chrome it goes on to supply itself. */
export const resetCss = () => sheetCss(RESET);

/** The page furniture on top of a reset: the grounded body, the focus ring, the
 *  scrollbars and the admin table grid. Taken alone by a target that brings its
 *  own reset - a Tailwind app has preflight, and two unlayered resets would
 *  fight. */
export const pageCss = () => sheetCss([...PAGE, ...ADMIN_TABLE]);

/** The reset and page furniture a browser target wants. A TV shell takes the
 *  reset alone, so this is not in the `tokens` half every target shares. */
export const baseCss = () => [resetCss(), pageCss()].join('\n\n');

/**
 * How a face behaves while it is still on the wire.
 *
 * A BUILD ships `optional`, because swapping the face in after first paint
 * moved the whole column (0.78 CLS). `optional` has no swap period at all: a
 * face that has not arrived within the ~100ms block period is dropped for the
 * life of the page, so it only ever lands because kromaFontPreload() puts a
 * matching <link rel=preload> in the head (see font-preload.ts).
 *
 * The DEV SERVER ships `swap` instead. There the stylesheet is injected by the
 * module graph rather than linked in the head, and a cold session has a
 * hundred stories to transform first; past a few seconds Chrome reports the
 * preload as unused and may drop it, the block period expires, and the reader
 * is left on system-ui until a reload warms the cache. Nobody measures CLS on a
 * dev server, and a typeface that only appears every other F5 is the worse bug.
 */
export type FontDisplay = 'optional' | 'swap';

/** The whole design system, framework-free: type, tokens, motion and the reset.
 *  A Tailwind app adds `@import "tailwindcss"` and `@kroma/ui/css/theme`. */
export function kromaCss(display: FontDisplay = 'optional'): string {
  return [fontsCss(display), tokensCss(), motionCss(), baseCss()].join('\n\n');
}

/** What a television takes: the same sheet without the page furniture on top of
 *  the reset. A TV shell hides overflow, grounds itself dark and owns its focus
 *  visuals, so `page` would only fight it. */
export function tvCss(display: FontDisplay = 'optional'): string {
  return [fontsCss(display), tokensCss(), motionCss(), resetCss()].join('\n\n');
}
