// Icon imports resolve by name, so no bundler can tree-shake them; the source is
// scanned and only the names it mentions are kept.
// Single file, no relative imports: required from both CommonJS and ESM, which
// disagree about the `.ts` extension.

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

const GLYPH_SOURCE = join('packages', 'ui', 'src', 'lib', 'icons', 'glyph-source.ts');

type TablerPkg = '@tabler/icons-react' | '@tabler/icons-react-native';

const SOURCE_EXT = /\.(ts|tsx)$/;
// A slug a fixture happens to spell is a false hit costing a real glyph.
// Stories are NOT excluded: the workbench ships them.
const NOT_SHIPPED = /\.(test|spec)\.(ts|tsx)$/;
// `ios`, `android` and `src-tauri` hold no TypeScript, and `ios/Pods` alone is
// ~7,100 directories - most of the walk's cost on every Metro start.
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
const LITERAL = /['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g;

export interface KromaUiOptions {
  repoRoot: string;
  /** `full` keeps all of Tabler, which an app that reflects over the catalogue
   * needs: `iconNames()` and `hasGlyph()` answer from whatever shipped. */
  icons?: 'subset' | 'full';
}

function exportName(slug: string): string {
  let out = 'Icon';
  for (const word of slug.split('-')) out += word.charAt(0).toUpperCase() + word.slice(1);
  return out;
}

// Resolved from packages/ui: bun installs per package, so Tabler is not visible
// from a client.
function tablerDir(repoRoot: string, pkg: TablerPkg): string {
  const entry = createRequire(join(repoRoot, 'packages/ui/package.json')).resolve(pkg);
  return entry.slice(0, entry.lastIndexOf(`${sep}dist${sep}`));
}

const BARREL_EXPORT = /export\s*\{([^}]*)\}\s*from\s*'\.\/icons\/([A-Za-z0-9]+)\.mjs'/g;
const EXPORTED_AS = /default as (Icon[A-Za-z0-9]+)/g;

// Read from the barrel, not from a directory listing: 66 of Tabler's exports are
// aliases with no file of their own (`IconDiscountCheck` lives in
// `IconRosetteDiscount.mjs`), and a listing misses them.
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

/** One collector over the workspace source: the files it wants by name, what it
 * takes from each, and the end of the walk that carried it. */
export interface SourcePass {
  wants(name: string): boolean;
  read(source: string): void;
  done(): void;
}

function walk(dir: string, passes: readonly SourcePass[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      walk(p, passes);
      continue;
    }
    if (!SOURCE_EXT.test(e.name)) continue;
    const wanted = passes.filter((pass) => pass.wants(e.name));
    if (wanted.length === 0) continue;
    let source: string;
    try {
      source = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    for (const pass of wanted) pass.read(source);
  }
}

const SOURCE_DIRS = ['packages', 'clients', 'apps', 'modules'];

/** The four workspace directories a scan reads, under `repoRoot`. */
export function sourceRoots(repoRoot: string): string[] {
  return SOURCE_DIRS.map((dir) => join(repoRoot, dir));
}

/** One traversal for every pass that wants it: the directory walk is what the
 * scan costs, and a second collector only adds a regex over source already
 * read. */
export function walkSources(roots: readonly string[], passes: readonly SourcePass[]): void {
  if (passes.length === 0) return;
  for (const root of roots) walk(root, passes);
  for (const pass of passes) pass.done();
}

/** Whether a walk of `roots` reads that file, so a watcher can place a change
 * against the scan without walking again. */
export function walkReaches(roots: readonly string[], file: string): boolean {
  const root = roots.find((r) => file.startsWith(`${r}${sep}`));
  if (!root) return false;
  const parts = file.slice(root.length + 1).split(sep);
  const name = parts.pop();
  if (!name || name.startsWith('.') || !SOURCE_EXT.test(name)) return false;
  return parts.every((part) => !part.startsWith('.') && !SKIP.has(part));
}

interface Subset {
  code: string;
  note: string;
}

interface IconScan {
  available: Map<string, string>;
  used: Set<string>;
  walked: boolean;
  subset?: Subset;
}

const CACHE = new Map<string, IconScan>();

// Not `localeCompare`: this ordering ends up in generated source, so it must be
// identical on every machine rather than follow the build's locale.
function byCodeUnit(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function iconScan(repoRoot: string, pkg: TablerPkg): IconScan {
  const key = `${repoRoot}|${pkg}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const fresh: IconScan = {
    available: iconModules(tablerDir(repoRoot, pkg), pkg),
    used: new Set(['IconHelpCircle']), // the fallback, always drawn
    walked: false,
  };
  CACHE.set(key, fresh);
  return fresh;
}

function scanPass(scan: IconScan): SourcePass | null {
  if (scan.walked) return null;
  return {
    wants: (name) => !NOT_SHIPPED.test(name),
    read(source) {
      for (const [, slug] of source.matchAll(LITERAL)) {
        const name = exportName(slug as string);
        if (scan.available.has(name)) scan.used.add(name);
      }
    },
    done() {
      scan.walked = true;
    },
  };
}

/** The icon scan as one pass, for a caller already walking the workspace for
 * something else. Null once the answer is known. */
export function iconPass(repoRoot: string): SourcePass | null {
  return scanPass(iconScan(repoRoot, '@tabler/icons-react'));
}

function emit(scan: IconScan): Subset {
  const names = [...scan.used].sort(byCodeUnit);
  // Per-icon default imports, so the result does not depend on Tabler's barrel
  // being shakeable.
  return {
    code: [
      ...names.map((n) => `import ${n} from ${JSON.stringify(scan.available.get(n))};`),
      `export const EXPORTS = { ${names.join(', ')} };`,
      'export const FALLBACK = IconHelpCircle;',
    ].join('\n'),
    note: `[kroma-ui] ${names.length} of ${scan.available.size} Tabler icons kept`,
  };
}

function iconSubset(repoRoot: string, pkg: TablerPkg): Subset {
  const scan = iconScan(repoRoot, pkg);
  const pass = scanPass(scan);
  if (pass) walkSources(sourceRoots(repoRoot), [pass]);
  scan.subset ??= emit(scan);
  return scan.subset;
}

// Both adapters match the module by path: a rename would disable the swap
// silently, in production builds only, under a green build.
function assertTargetExists(repoRoot: string): void {
  if (existsSync(join(repoRoot, GLYPH_SOURCE))) return;
  throw new Error(
    `[kroma-ui] ${GLYPH_SOURCE} not found under ${repoRoot}. The icon subset is keyed on that path; update GLYPH_SOURCE in @kroma/ui/bundler if the module moved.`,
  );
}

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

interface MetroConfigLike {
  resolver?: { resolveRequest?: MetroResolve; [k: string]: unknown };
  [k: string]: unknown;
}

export const kromaUi = {
  /** The Vite half. Browser targets render DOM `<svg>`, so this draws from
   * `@tabler/icons-react`. */
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

  /** The Metro half; native targets draw from `@tabler/icons-react-native`. The
   * generated module is written to `node_modules/.cache` and swapped in via
   * `resolveRequest`, since Metro has no virtual modules.
   *
   * The write happens HERE, at config-eval time, and not lazily on first
   * resolution: `expo export` crawls the filesystem once and reads every hash
   * from that one snapshot, so a file first written during resolution is not in
   * it and the bundle dies on `Failed to get the SHA-1`. Only the dev server,
   * which keeps a watcher, ever noticed the late write. Config eval runs before
   * the crawl, which makes the two modes agree; the scan it costs every
   * `expo start` is ~80ms. */
  metro(config: MetroConfigLike, { repoRoot, icons = 'subset' }: KromaUiOptions): MetroConfigLike {
    if (icons === 'full') return config;
    assertTargetExists(repoRoot);

    const { code, note } = iconSubset(repoRoot, '@tabler/icons-react-native');
    const cacheDir = join(repoRoot, 'node_modules', '.cache', 'kroma-ui');
    mkdirSync(cacheDir, { recursive: true });
    const generated = join(cacheDir, 'glyph-source.js');
    // Only when it changed: Metro resolves this into the graph, so a pointless
    // rewrite bumps an mtime the caches key on.
    if (!existsSync(generated) || readFileSync(generated, 'utf8') !== code) {
      writeFileSync(generated, code);
    }
    console.log(note);

    config.resolver ??= {};
    const resolver = config.resolver;
    const previous = resolver.resolveRequest;
    resolver.resolveRequest = (context, moduleName, platform) => {
      const resolved = (previous ?? context.resolveRequest)(context, moduleName, platform);
      // Swap on the RESOLVED path rather than the specifier: the import is
      // relative (`./glyph-source`), so the specifier alone does not identify it.
      return resolved?.filePath?.endsWith(GLYPH_SOURCE)
        ? { ...resolved, filePath: generated }
        : resolved;
    };
    return config;
  },
};
