import { readFileSync } from 'node:fs';
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
import { foldAlphas, scanAlphas } from './alpha-scan.ts';

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

/**
 * The two typefaces, self-hosted: a KROMA install can have no route to a CDN.
 *
 * Absolute paths, so Vite emits the woff2 from wherever the importing
 * stylesheet lives.
 */
export function fontsCss(): string {
  const slug = (family: string) => family.toLowerCase().replace(/\s+/g, '-');
  return SELF_HOSTED.flatMap((family) =>
    Object.entries(SUBSETS).map(([subset, range]) =>
      rule('@font-face', [
        `font-family: "${family}";`,
        'font-style: normal;',
        'font-weight: 400 800;',
        // `optional`, not `swap`: swapping the face after first paint moved the
        // whole column (0.78 CLS). The shells preload so it lands in time.
        'font-display: optional;',
        `src: url("${FONT_DIR}${slug(family)}-${subset}.woff2") format("woff2");`,
        `unicode-range: ${range};`,
      ]),
    ),
  ).join('\n\n');
}

const readCss = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../src/styles/${name}.css`, import.meta.url)), 'utf8');

/** Keyframes the components animate with, on every browser target. */
export const motionCss = () => readCss('motion');

/** The UA stylesheet undone, and nothing that assumes a page: what a target
 *  needs whatever chrome it goes on to supply itself. */
export const resetCss = () => readCss('reset');

/** The reset and page furniture a browser target wants. A TV shell takes the
 *  reset alone, so this is not in the `tokens` half every target shares. */
export const baseCss = () => [resetCss(), readCss('base')].join('\n\n');

/** The whole design system, framework-free: type, tokens, motion and the reset.
 *  A Tailwind app adds `@import "tailwindcss"` and `@kroma/ui/css/theme`. */
export function kromaCss(): string {
  return [fontsCss(), tokensCss(), motionCss(), baseCss()].join('\n\n');
}

// Under `/css`, because a bare `@kroma/ui` resolves to the TypeScript entry and
// Tailwind then tries to parse it as a stylesheet.
const DIRECTIVE = /@import\s+["']@kroma\/ui\/css(\/[a-z]+)?["']\s*;/g;

const EXPANSION: Record<string, () => string> = {
  '': kromaCss,
  '/tokens': tokensCss,
  '/theme': themeCss,
  '/fonts': fontsCss,
  '/motion': motionCss,
  '/reset': resetCss,
  '/base': baseCss,
};

const expand = (code: string) =>
  code.replace(DIRECTIVE, (_, which: string | undefined) => {
    const emit = EXPANSION[which ?? ''];
    if (!emit) {
      throw new Error(
        `[kroma-ui] no such stylesheet: @kroma/ui/css${which}. Known: ${Object.keys(EXPANSION)
          .map((k) => `@kroma/ui/css${k}`)
          .join(', ')}`,
      );
    }
    return emit();
  });

interface BundleFile {
  type: string;
  fileName: string;
  source?: unknown;
}

interface PluginContext {
  addWatchFile?: (id: string) => void;
}

interface DevModule {
  id: string | null;
}

interface DevEnvironment {
  moduleGraph: { getModuleById(id: string): DevModule | undefined };
  reloadModule?(module: DevModule): unknown;
}

interface FileChange {
  file: string;
  read(): string | Promise<string>;
}

interface PluginList {
  plugins: readonly { name: string }[];
}

interface CssPlugin {
  name: string;
  enforce: 'pre';
  configResolved(config: PluginList): void;
  transform(this: PluginContext, code: string, id: string): { code: string; map: null } | null;
  hotUpdate(this: { environment?: DevEnvironment }, change: FileChange): Promise<void>;
  generateBundle(options: unknown, bundle: Record<string, BundleFile>): void;
}

const NAME = 'kroma-tokens';

const TAILWIND = '@tailwindcss/vite:generate';

const OUT_OF_ORDER =
  `[kroma-ui] kromaUI() must come before tailwindcss() in the Vite plugin list. ` +
  `Tailwind resolves @import itself, so from there it swallows "@kroma/ui/css" and ` +
  `the build ships every custom property undefined.`;

// Watched, or the dev server keeps serving the CSS it generated at startup.
const SOURCES = [
  '../src/core/tokens/colors.ts',
  '../src/core/tokens/css-var.ts',
  '../src/core/tokens/effects.ts',
  '../src/core/tokens/layout.ts',
  '../src/core/tokens/typography.ts',
  '../src/styles/base.css',
  '../src/styles/reset.css',
  '../src/styles/motion.css',
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

/**
 * Expands the KROMA directives, the way `@import "tailwindcss"` expands into
 * Tailwind.
 *
 * Two hooks: Vite inlines nested CSS `@import`s inside its own plugin, so those
 * never reach `transform` and `generateBundle` sweeps the emitted assets.
 *
 * A source file that names an alpha step for the first time reopens the scan
 * and reloads the stylesheets that carry it, so a dev session does not have to
 * be restarted for `accent/45` to exist.
 */
export function kromaTokens(): CssPlugin {
  const expanded = new Set<string>();
  return {
    name: NAME,
    enforce: 'pre',
    configResolved({ plugins }) {
      const mine = plugins.findIndex((plugin) => plugin.name === NAME);
      const tailwind = plugins.findIndex((plugin) => plugin.name.startsWith(TAILWIND));
      if (mine === -1 || tailwind === -1 || tailwind > mine) return;
      throw new Error(OUT_OF_ORDER);
    },
    transform(code, id) {
      if (!id.includes('.css')) return null;
      DIRECTIVE.lastIndex = 0;
      if (!DIRECTIVE.test(code)) return null;
      for (const file of SOURCES) this.addWatchFile?.(file);
      expanded.add(id);
      return { code: expand(code), map: null };
    },
    async hotUpdate({ file, read }) {
      if (!(await foldAlphas(SOURCE_ROOTS, KNOWN_COLOR_NAMES, file, read))) return;
      const environment = this.environment;
      if (!environment?.reloadModule) return;
      const stale = [...expanded]
        .map((id) => environment.moduleGraph.getModuleById(id))
        .filter((module) => module !== undefined);
      await Promise.all(stale.map((module) => environment.reloadModule?.(module)));
    },
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        if (typeof file.source !== 'string' || !file.source.includes('@kroma/ui')) continue;
        file.source = expand(file.source);
      }
    },
  };
}
