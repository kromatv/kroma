import { fileURLToPath } from 'node:url';
import { foldAlphas } from './alpha-scan.ts';
import {
  baseCss,
  type FontDisplay,
  fontsCss,
  KNOWN_COLOR_NAMES,
  kromaCss,
  motionCss,
  pageCss,
  resetCss,
  SOURCE_ROOTS,
  themeCss,
  tokensCss,
  tvCss,
} from './tokens.ts';

const PART_NAMES = [
  'kroma',
  'tv',
  'tokens',
  'theme',
  'fonts',
  'motion',
  'reset',
  'page',
  'base',
] as const;

type Part = (typeof PART_NAMES)[number];

const AGGREGATE: Part = 'kroma';

const parts = (display: FontDisplay): Record<Part, () => string> => ({
  kroma: () => kromaCss(display),
  tv: () => tvCss(display),
  tokens: () => tokensCss(),
  theme: () => themeCss(),
  fonts: () => fontsCss(display),
  motion: () => motionCss(),
  reset: () => resetCss(),
  page: () => pageCss(),
  base: () => baseCss(),
});

const isPart = (part: string): part is Part => PART_NAMES.includes(part as Part);

const emit = (part: string, display: FontDisplay) => (isPart(part) ? parts(display)[part]() : null);

/**
 * The one name either door uses: `import '@kromatv/ui/css'` from an entry that
 * is TypeScript, `@import "@kromatv/ui/css"` from a stylesheet,
 * `@kromatv/ui/css/<part>` for one part of it, and `?url` on the import for a
 * `<link>`.
 *
 * Under `/css`, because a bare `@kromatv/ui` resolves to the TypeScript entry
 * and Tailwind then tries to parse it as a stylesheet.
 */
const SPECIFIER = '@kromatv/ui/css';

const DIRECTIVE = /@import\s+["']@kromatv\/ui\/css(\/[a-z]+)?["']\s*;/g;

const specifier = (part: string) => (part === AGGREGATE ? SPECIFIER : `${SPECIFIER}/${part}`);

const unknown = (asked: string) =>
  new Error(
    `[kroma-ui] no such stylesheet: ${asked}. Known: ${PART_NAMES.map(specifier).join(', ')}`,
  );

const expand = (code: string, display: FontDisplay) =>
  code.replace(DIRECTIVE, (_, which: string | undefined) => {
    const css = emit(which ? which.slice(1) : AGGREGATE, display);
    if (css === null) throw unknown(`${SPECIFIER}${which}`);
    return css;
  });

// Rollup's convention for "this id belongs to a plugin, do not touch it". The
// name still ends in `.css`, which is how Vite knows to run its own CSS
// pipeline over what `load` hands back.
const RESOLVED = '\0kroma-css:';

const SUFFIX = '.css';

const queryless = (id: string) => id.split('?')[0] ?? id;

const queryOf = (id: string) => id.slice(queryless(id).length);

const partOf = (id: string) => queryless(id).slice(RESOLVED.length, -SUFFIX.length);

// The package specifier as an id of ours, or null for anything else. An unknown
// part throws rather than falling through to Vite's resolver, whose "failed to
// resolve import" says nothing about which parts exist.
const claim = (source: string): string | null => {
  const path = queryless(source);
  if (path !== SPECIFIER && !path.startsWith(`${SPECIFIER}/`)) return null;
  const part = path === SPECIFIER ? AGGREGATE : path.slice(SPECIFIER.length + 1);
  if (!isPart(part)) throw unknown(path);
  return `${RESOLVED}${part}${SUFFIX}${queryOf(source)}`;
};

const isResolved = (id: string) => queryless(id).endsWith(SUFFIX) && id.startsWith(RESOLVED);

// `?url` goes back to Vite's own CSS pipeline, which is what rewrites the
// absolute `@font-face` src into an emitted woff2 and hands back the hashed
// stylesheet. Answering it here would ship the build machine's file paths.
const wantsUrl = (id: string) => /[?&]url\b/.test(id);

// How the dev server addresses a module of its own: `/@id/` with the null byte
// spelled out. A <link> to it arrives with `Accept: text/css`, which is what
// makes Vite serve the compiled stylesheet rather than the JS that injects it.
const servedUrl = (base: string, id: string) => `${base}@id/__x00__${id.slice(1)}`;

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
  command?: 'serve' | 'build';
  base?: string;
}

interface CssPlugin {
  name: string;
  enforce: 'pre';
  configResolved(config: PluginList): void;
  resolveId(source: string): string | null;
  load(this: PluginContext, id: string): string | null;
  transform(this: PluginContext, code: string, id: string): { code: string; map: null } | null;
  hotUpdate(this: { environment?: DevEnvironment }, change: FileChange): Promise<void>;
  generateBundle(options: unknown, bundle: Record<string, BundleFile>): void;
}

const NAME = 'kroma-tokens';

const TAILWIND = '@tailwindcss/vite:generate';

const OUT_OF_ORDER =
  `[kroma-ui] kromaUI() must come before tailwindcss() in the Vite plugin list. ` +
  `Tailwind resolves @import itself, so from there it swallows "@kromatv/ui/css" and ` +
  `the build ships every custom property undefined.`;

const SOURCES = [
  '../src/core/tokens/colors.ts',
  '../src/core/tokens/css-var.ts',
  '../src/core/tokens/effects.ts',
  '../src/core/tokens/layout.ts',
  '../src/core/tokens/typography.ts',
  '../src/styles/motion.ts',
  '../src/styles/page.ts',
  '../src/styles/reset.ts',
  '../src/styles/sheet.ts',
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

/**
 * Serves the design system's stylesheets through either door, both spelled
 * {@link SPECIFIER}: the `@import "@kromatv/ui/css"` a stylesheet writes, and
 * the `import '@kromatv/ui/css'` a target whose entry is TypeScript writes
 * instead. `?url` on the import goes through Vite's own CSS pipeline, so a
 * `<link>` gets a hashed asset with its font `url()`s rewritten.
 *
 * The directive needs two hooks: Vite inlines nested CSS `@import`s inside its
 * own plugin, so those never reach `transform` and `generateBundle` sweeps the
 * emitted assets.
 */
export function kromaTokens(): CssPlugin {
  const expanded = new Set<string>();
  let command: 'serve' | 'build' = 'build';
  let base = '/';
  const display = (): FontDisplay => (command === 'serve' ? 'swap' : 'optional');
  return {
    name: NAME,
    enforce: 'pre',
    configResolved(config) {
      command = config.command ?? 'build';
      base = config.base ?? '/';
      const mine = config.plugins.findIndex((plugin) => plugin.name === NAME);
      const tailwind = config.plugins.findIndex((plugin) => plugin.name.startsWith(TAILWIND));
      if (mine === -1 || tailwind === -1 || tailwind > mine) return;
      throw new Error(OUT_OF_ORDER);
    },
    resolveId(source) {
      if (isResolved(source)) return source;
      return claim(source);
    },
    load(id) {
      if (!isResolved(id)) return null;
      if (wantsUrl(id)) {
        if (command === 'build') return null;
        return `export default ${JSON.stringify(servedUrl(base, queryless(id)))};`;
      }
      const part = partOf(id);
      const css = emit(part, display());
      if (css === null) throw unknown(specifier(part));
      for (const file of SOURCES) this.addWatchFile?.(file);
      expanded.add(id);
      return css;
    },
    transform(code, id) {
      if (!id.includes('.css')) return null;
      DIRECTIVE.lastIndex = 0;
      if (!DIRECTIVE.test(code)) return null;
      for (const file of SOURCES) this.addWatchFile?.(file);
      expanded.add(id);
      return { code: expand(code, display()), map: null };
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
        if (typeof file.source !== 'string' || !file.source.includes('@kromatv/ui')) continue;
        file.source = expand(file.source, display());
      }
    },
  };
}
