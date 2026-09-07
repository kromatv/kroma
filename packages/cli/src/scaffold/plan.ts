import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PUBLIC_NAME } from '@kroma/module-sdk/shared';
import { MODULE_SCHEMA_VERSION } from '@kroma/registry';
import { z } from 'zod';
import type { Vars } from './render';

export type Kind = 'full' | 'server' | 'ui';

export interface Answers {
  id: string;
  name: string;
  description: string;
  kind: Kind;
  storage: boolean;
  /** Path deps into this repository's `server/crates` and `workspace:*` links,
   *  for a module that lives under `modules/` here. */
  inRepo: boolean;
}

export interface Versions {
  /** The SDK's own version: what the npm deps and the Rust crates carry. */
  sdk: string;
  /** The server line the module is written against, for `engines.server`. */
  server: string;
  rustChannel: string;
  /** The React Native the kit is written against (the tvOS fork), which the
   *  scaffold pins so the kit's types read the same outside this repository. */
  reactNative: string;
}

/** The workspace package here, or the published one it is bundled into. */
const OWN_NAMES = new Set(['@kroma/cli', PUBLIC_NAME]);

function packageRoot(from: string): string {
  let dir = from;
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest) && OWN_NAMES.has(JSON.parse(readFileSync(manifest, 'utf8')).name)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('kroma: cannot find my own package.json');
    dir = parent;
  }
}

const CLI_ROOT = packageRoot(import.meta.dirname);

/** The npm slug of an id: `tv.acme.notes` → `notes`; `tv.acme.my-notes` → `my-notes`. */
export function slugOf(id: string): string {
  return id.split('.').pop() ?? id;
}

function pascal(slug: string): string {
  return slug
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join('');
}

function snake(slug: string): string {
  return slug.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

const PackageJson = z.object({
  version: z.string(),
  kroma: z.object({ reactNative: z.string() }),
});

/** What this CLI was installed as, and what the tree it runs in pins. Inside the
 *  repository every version is `0.0.0`, so the server's own version stands in. */
export function versions(cwd: string): Versions {
  const own = PackageJson.parse(JSON.parse(readFileSync(join(CLI_ROOT, 'package.json'), 'utf8')));
  const repo = repoRoot(cwd);
  const server = repo ? serverVersion(repo) : null;
  const sdk = own.version !== '0.0.0' ? own.version : (server ?? '0.0.0');
  const channel = repo ? rustChannel(repo) : null;
  return {
    sdk,
    server: server ?? sdk,
    rustChannel: channel ?? '1.98.0',
    reactNative: own.kroma.reactNative,
  };
}

/** The KROMA checkout `cwd` is inside, if any. */
export function repoRoot(cwd: string): string | null {
  let dir = cwd;
  for (;;) {
    if (existsSync(join(dir, 'server', 'Cargo.toml')) && existsSync(join(dir, 'modules')))
      return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function serverVersion(repo: string): string | null {
  const toml = readFileSync(join(repo, 'server', 'Cargo.toml'), 'utf8');
  return /^version\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? null;
}

function rustChannel(repo: string): string | null {
  const path = join(repo, 'rust-toolchain.toml');
  if (!existsSync(path)) return null;
  return /^channel\s*=\s*"([^"]+)"/m.exec(readFileSync(path, 'utf8'))?.[1] ?? null;
}

function serverRange(version: string): string {
  return version === '0.0.0' ? '*' : `>=${version}`;
}

/** The dependency spec for the SDK: a `workspace:*` link in this repository,
 *  else the published package at this CLI's own version. */
export function sdkSpec(v: Versions, inRepo: boolean): string {
  if (inRepo) return 'workspace:*';
  return v.sdk === '0.0.0' ? '*' : `^${v.sdk}`;
}

/** The template trees a kind is rendered from. */
export function treesFor(kind: Kind): string[] {
  const trees = ['base'];
  if (kind !== 'server') trees.push('ui');
  if (kind !== 'ui') trees.push('server');
  return trees.map((t) => join(CLI_ROOT, 'templates', t));
}

/** Files a tree carries that an in-repo module must not: the repository's own
 *  toolchain pin and cargo config already reach it. */
export function skipInRepo(rel: string): boolean {
  return rel === 'rust-toolchain.toml' || rel === '.cargo/config.toml' || rel === '.gitignore';
}

export function templateVars(a: Answers, v: Versions): Vars {
  const slug = slugOf(a.id);
  const crate = `kroma-module-${slug}`;
  const migrations = a.storage
    ? `
    fn migrations(&self) -> &'static str {
        "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);"
    }
`
    : '';
  return {
    ID: a.id,
    SDK: a.inRepo ? '@kroma/module-sdk' : PUBLIC_NAME,
    SLUG: slug,
    NAME: a.name,
    DESCRIPTION: a.description,
    VERSION: '0.1.0',
    PAGE: `${pascal(slug)}Page`,
    STRUCT: `${pascal(slug)}Module`,
    CRATE: crate,
    CRATE_IDENT: snake(crate),
    SDK_CRATES: a.inRepo ? '../../../server/crates' : `../node_modules/${PUBLIC_NAME}/rust`,
    SDK_FEATURES: a.storage ? ', features = ["storage"]' : '',
    RUNTIME_FEATURES: a.storage ? ', features = ["storage"]' : '',
    MIGRATIONS: migrations,
    RUST_CHANNEL: v.rustChannel,
  };
}

/** The manifest, built as data rather than rendered, so it is valid JSON by
 *  construction and carries only the keys the answers call for. */
export function manifestFor(a: Answers, v: Versions): Record<string, unknown> {
  const manifest: Record<string, unknown> = {
    $schema: `https://modules.kroma.tv/schemas/${MODULE_SCHEMA_VERSION}/manifest.json`,
    schemaVersion: MODULE_SCHEMA_VERSION,
    id: a.id,
    name: a.name,
    version: '0.1.0',
    description: a.description,
    engines: { server: serverRange(v.server) },
  };
  if (a.kind !== 'server') manifest.feRemote = { module: './remoteEntry.js' };
  if (a.storage) manifest.storage = { core: {} };
  return manifest;
}

/** The module's `package.json`: the SDK and the design system for the page, the
 *  CLI to build it with. `workspace:*` inside this repository. */
export function packageJsonFor(a: Answers, v: Versions): Record<string, unknown> | null {
  if (a.kind === 'server') return null;
  const dep = sdkSpec(v, a.inRepo);
  const slug = slugOf(a.id);
  return {
    name: a.inRepo ? `@kroma/module-${slug}` : a.id,
    version: '0.0.0',
    private: true,
    type: 'module',
    description: a.description,
    ...(a.inRepo
      ? { exports: { '.': './ui/src/module.tsx', './schemas': './ui/src/schemas.ts' } }
      : {}),
    scripts: a.inRepo
      ? { typecheck: 'tsc --noEmit' }
      : { dev: 'kroma dev', build: 'kroma build', check: 'kroma check', typecheck: 'tsc --noEmit' },
    dependencies: {
      ...(a.inRepo
        ? { '@kroma/module-sdk': 'workspace:*', '@kroma/ui': 'workspace:*' }
        : { [PUBLIC_NAME]: dep }),
      zod: '^4.5.4',
    },
    peerDependencies: { react: '^19.2.8' },
    devDependencies: {
      ...(a.inRepo ? {} : { react: '^19.2.8', 'react-native': v.reactNative }),
      '@types/react': '^19.2.18',
      typescript: '^7.0.2',
    },
    ...(a.inRepo ? {} : { overrides: { 'react-native': v.reactNative } }),
  };
}

export function tsconfigFor(a: Answers, depth: number): Record<string, unknown> | null {
  if (a.kind === 'server') return null;
  const base = a.inRepo ? `${'../'.repeat(depth)}tsconfig.base.json` : `${PUBLIC_NAME}/tsconfig`;
  return {
    extends: base,
    ...(a.inRepo ? { compilerOptions: { noEmit: true, types: ['react'] } } : {}),
    include: ['ui/src'],
  };
}
