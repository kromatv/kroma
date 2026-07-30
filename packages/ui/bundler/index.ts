// How an app BUILDS `@kroma/ui`, in one place, for both bundlers this repo uses.
//
//   // a Vite shell
//   import { kromaUi } from '@kroma/ui/bundler';
//   plugins: [kromaUi.vite({ repoRoot })]
//
//   // a Metro (Expo) client, from CommonJS
//   const { kromaUi } = require('@kroma/ui/bundler');
//   module.exports = kromaUi.metro(config, { repoRoot });
//
// It lives with the kit rather than with a client because what it does is a
// property of the kit, and because there are five configs that would otherwise
// each carry a copy. Two adapters rather than one function: the shapes are
// genuinely different - Vite takes a plugin object, Metro takes a config it
// mutates - and pretending otherwise would hide which one you get.
//
// ONE file on purpose. It is consumed from CommonJS (`require(esm)`) as well as
// from ESM TypeScript, and those two disagree about relative imports: Node needs
// the `.ts` extension, tsc rejects it without `allowImportingTsExtensions`. No
// import, no disagreement.
//
// ---- What it does today: the icon set ----
//
// `@kroma/ui`'s glyphs resolve BY NAME (`<Icon name="wave-sine" />`), which is
// what lets a name come from data - and what makes the set untreeshakeable,
// because no bundler can prove which of Tabler's 6167 icons a computed lookup
// will ask for. So all of them ship. Measured: 1.01 MB of a 10.77 MB webOS
// package, and 6.0 MB of a 9.6 MB Hermes bundle, for icons nobody draws.
//
// So the source is scanned and only the names it mentions are kept. The scan
// deliberately OVER-collects: any quoted kebab-case word that happens to name a
// real icon is kept, so "banana" costs a few hundred bytes - while the thing that
// would actually hurt, missing a name that IS used and showing a question mark on
// a device nobody is looking at, cannot happen. A hand-written list is the
// opposite trade: smaller, and wrong the first time somebody forgets it.
//
// Two things it does NOT cover, both by design. Names assembled at RUNTIME reach
// an icon only through a module manifest. And `hasGlyph()` / `iconNames()` answer
// from the runtime set, so an app that REFLECTS over the catalogue - the kit's
// icon gallery - must ask for `icons: 'full'`.

import {
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';

/** The one module that pulls Tabler in at runtime, and so the one this swaps. */
const GLYPH_SOURCE = join('packages', 'ui', 'src', 'lib', 'icons', 'glyph-source.ts');

/**
 * Which Tabler to draw from. They ship the same icons under the same export
 * names; only the renderer differs, so the platform picks the package: `-react`
 * draws DOM <svg>, `-react-native` draws through react-native-svg.
 */
type TablerPkg = '@tabler/icons-react' | '@tabler/icons-react-native';

const SOURCE_EXT = /\.(ts|tsx)$/;
/**
 * Directories the scan never enters. `ios`, `android` and `src-tauri` are native
 * build trees: they hold no TypeScript, but `ios/Pods` alone is ~7,100
 * directories on a machine that has run `pod install`, which was 305 ms of the
 * walk's 335 ms - paid on every Metro start until they were pruned.
 */
const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.vite',
  'ios',
  'android',
  'src-tauri',
]);
/** Kebab-cased words in quotes: the shape every icon name is written in. */
const LITERAL = /['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g;

export interface KromaUiOptions {
  /** The monorepo root: what gets scanned, and where Tabler is resolved from. */
  repoRoot: string;
  /**
   * `subset` (default) ships only the icons the source names. `full` keeps all
   * of Tabler, which an app needs when it REFLECTS over the catalogue rather
   * than naming glyphs - `iconNames()` and `hasGlyph()` answer from whatever
   * shipped, so the kit's icon gallery would otherwise list 243 of 6167.
   */
  icons?: 'subset' | 'full';
}

/** `wave-sine` -> `IconWaveSine`, the same transform `@kroma/ui`'s `exportName`
 * does at runtime (they are round-tripped against each other in its tests). */
function exportName(slug: string): string {
  let out = 'Icon';
  for (const word of slug.split('-')) out += word.charAt(0).toUpperCase() + word.slice(1);
  return out;
}

/** Tabler's install root. Resolved FROM packages/ui, the workspace that depends
 * on it - bun installs per package, so it is not visible from a client. */
function tablerDir(repoRoot: string, pkg: TablerPkg): string {
  const entry = createRequire(join(repoRoot, 'packages/ui/package.json')).resolve(pkg);
  return entry.slice(0, entry.lastIndexOf(`${sep}dist${sep}`));
}

/** `export { default as IconDiscount2, default as IconRosetteDiscount } from './icons/X.mjs'` */
const BARREL_EXPORT = /export\s*\{([^}]*)\}\s*from\s*'\.\/icons\/([A-Za-z0-9]+)\.mjs'/g;
const EXPORTED_AS = /default as (Icon[A-Za-z0-9]+)/g;

/**
 * Every name the package exports, mapped to the module that defines it.
 *
 * Read from the BARREL, not from a directory listing: 66 of Tabler's exports are
 * ALIASES with no file of their own (`IconDiscountCheck` lives in
 * `IconRosetteDiscount.mjs`). A listing misses them, and because they are still
 * in the .d.ts they typecheck and draw in a full build - so the subset would
 * quietly fall back to the question mark for them, in production only, which is
 * exactly what this file's header promises cannot happen.
 */
function iconModules(dir: string, pkg: TablerPkg): Map<string, string> {
  const barrel = join(dir, 'dist', 'esm', `tabler-${pkg.slice('@tabler/'.length)}.mjs`);
  const out = new Map<string, string>();
  const src = readFileSync(barrel, 'utf8');
  for (const match of src.matchAll(BARREL_EXPORT)) {
    const names = match[1];
    const file = match[2];
    if (!names || !file) continue;
    const path = join(dir, 'dist', 'esm', 'icons', `${file}.mjs`);
    for (const alias of names.matchAll(EXPORTED_AS)) {
      if (alias[1]) out.set(alias[1], path);
    }
  }
  return out;
}

function* sourceFiles(dir: string): Generator<string> {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // a root that does not exist in this checkout
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sourceFiles(p);
    else if (SOURCE_EXT.test(e.name)) yield p;
  }
}

/** The scan costs a workspace walk, and a full TV build runs six bundler
 * processes; within one process it must happen at most once per package. */
const CACHE = new Map<string, { code: string; note: string }>();

/**
 * Deliberately NOT `localeCompare`: this ordering ends up in generated source,
 * so it has to be identical on every machine rather than following whatever
 * locale the build happens to run under.
 */
function byCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** What the swapped `glyph-source` module says, and how much it left out. */
function iconSubset(repoRoot: string, pkg: TablerPkg): { code: string; note: string } {
  const key = `${repoRoot}|${pkg}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  const available = iconModules(tablerDir(repoRoot, pkg), pkg);

  const used = new Set(['IconHelpCircle']); // the fallback, always drawn
  for (const root of ['packages', 'clients']) {
    for (const file of sourceFiles(join(repoRoot, root))) {
      for (const [, slug] of readFileSync(file, 'utf8').matchAll(LITERAL)) {
        const name = exportName(slug as string);
        if (available.has(name)) used.add(name);
      }
    }
  }

  const names = [...used].sort(byCodeUnit);
  // Each icon from its own module, by absolute path, as the DEFAULT export -
  // which is how Tabler writes them (`export { IconHome as default }`). Per-icon
  // so the result does not depend on the barrel being shakeable.
  const result = {
    code: [
      ...names.map((n) => `import ${n} from ${JSON.stringify(available.get(n))};`),
      `export const EXPORTS = { ${names.join(', ')} };`,
      'export const FALLBACK = IconHelpCircle;',
    ].join('\n'),
    note: `[kroma-ui] ${names.length} of ${available.size} Tabler icons kept`,
  };
  CACHE.set(key, result);
  return result;
}

/**
 * Both adapters match the module by PATH, and a path is exactly the thing a
 * refactor breaks silently: rename `glyph-source.ts` and the swap simply never
 * fires, in production builds only, shipping all 6167 icons under a green build.
 * So the path is checked once, up front, where the message can say what to do.
 */
function assertTargetExists(repoRoot: string): void {
  if (existsSync(join(repoRoot, GLYPH_SOURCE))) return;
  throw new Error(
    `[kroma-ui] ${GLYPH_SOURCE} not found under ${repoRoot}. The icon subset is keyed on that path; update GLYPH_SOURCE in @kroma/ui/bundler if the module moved.`,
  );
}

/** Minimal shape of the Vite plugin this returns, so the kit does not have to
 * depend on vite's types to describe it. */
interface VitePluginLike {
  name: string;
  apply: 'build';
  load(this: { info?: (msg: string) => void }, id: string): string | null;
}

type MetroResolve = (
  context: { resolveRequest: MetroResolve; [k: string]: unknown },
  moduleName: string,
  platform: string | null,
) => { filePath?: string; [k: string]: unknown };

/** Minimal shape of the Metro config this touches. */
interface MetroConfigLike {
  resolver?: { resolveRequest?: MetroResolve; [k: string]: unknown };
  [k: string]: unknown;
}

export const kromaUi = {
  /**
   * The Vite half. Browser targets render DOM `<svg>`, so they draw from
   * `@tabler/icons-react` - which is also what their alias already redirects
   * `-react-native` to.
   */
  vite({ repoRoot, icons = 'subset' }: KromaUiOptions): VitePluginLike {
    if (icons === 'subset') assertTargetExists(repoRoot);
    return {
      name: 'kroma-ui',
      apply: 'build',
      load(id) {
        if (icons === 'full' || !id.endsWith(GLYPH_SOURCE)) return null;
        const { code, note } = iconSubset(repoRoot, '@tabler/icons-react');
        this.info?.(note);
        return code;
      },
    };
  },

  /**
   * The Metro half, returning the same config it was given. Native targets draw
   * through react-native-svg, so they take `@tabler/icons-react-native`.
   *
   * The generated module is written to disk because `resolveRequest` can only
   * point at a file - Metro has no virtual modules there. node_modules/.cache is
   * already ignored and already outside what Metro watches.
   *
   * Both the scan and the write happen on the FIRST resolution of the target,
   * not here: this runs while `metro.config.js` is being evaluated, so doing the
   * work eagerly would put a workspace walk on the startup path of every
   * `expo start`, including dev servers where the subset buys nothing.
   */
  metro(config: MetroConfigLike, { repoRoot, icons = 'subset' }: KromaUiOptions): MetroConfigLike {
    if (icons === 'full') return config;
    assertTargetExists(repoRoot);

    let generated: string | undefined;
    const write = (): string => {
      if (generated) return generated;
      const { code, note } = iconSubset(repoRoot, '@tabler/icons-react-native');
      const cacheDir = join(repoRoot, 'node_modules', '.cache', 'kroma-ui');
      mkdirSync(cacheDir, { recursive: true });
      const path = join(cacheDir, 'glyph-source.js');
      // Only when it changed: Metro resolves this into the graph, so a pointless
      // rewrite bumps an mtime the caches key on.
      if (!existsSync(path) || readFileSync(path, 'utf8') !== code) writeFileSync(path, code);
      console.log(note);
      generated = path;
      return path;
    };

    config.resolver ??= {};
    const resolver = config.resolver;
    const previous = resolver.resolveRequest;
    resolver.resolveRequest = (context, moduleName, platform) => {
      const resolved = (previous ?? context.resolveRequest)(context, moduleName, platform);
      // Swap on the RESOLVED path rather than the specifier: the import is
      // relative (`./glyph-source`), so the specifier alone does not identify it.
      return resolved?.filePath?.endsWith(GLYPH_SOURCE)
        ? { ...resolved, filePath: write() }
        : resolved;
    };
    return config;
  },
};
