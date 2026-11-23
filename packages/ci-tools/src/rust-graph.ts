import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';
import type { Graph } from './rust-affected';
import { root } from './root';
import { SERVER, workspaces } from './rust-workspaces';

/** A node of the graph: a module workspace, the server's root package, or one server crate. */
export interface Node {
  id: string;
  dir: string;
}

const Table = z.record(z.string(), z.unknown());

const Dependencies = z.looseObject({
  dependencies: Table.optional(),
  'dev-dependencies': Table.optional(),
  'build-dependencies': Table.optional(),
});

const Manifest = Dependencies.extend({
  workspace: z.looseObject({ dependencies: Table.optional() }).optional(),
  target: z.record(z.string(), Dependencies).optional(),
});
type Manifest = z.infer<typeof Manifest>;

const Dependency = z.looseObject({
  path: z.string().optional(),
  workspace: z.boolean().optional(),
});

/** Every module workspace, the server's root package, and each crate under `server/crates`. */
export function nodes(): Node[] {
  const crates = join(SERVER.dir, 'crates');
  const own = readdirSync(crates, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(crates, entry.name, 'Cargo.toml')))
    .map((entry) => ({ id: `${SERVER.id}:${entry.name}`, dir: join(crates, entry.name) }));
  return [...workspaces(), ...own];
}

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8' });
const git = (args: string[]) => run('git', args);

const owner = (list: readonly Node[], at: string) =>
  list
    .filter((node) => at === node.dir || at.startsWith(`${node.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0]?.id;

const KINDS = ['dependencies', 'dev-dependencies', 'build-dependencies'] as const;

const declared = (manifest: Manifest) =>
  [manifest, ...Object.values(manifest.target ?? {})].flatMap((table) =>
    KINDS.flatMap((kind) => Object.entries(table[kind] ?? {})),
  );

function inheritedPaths(dir: string, manifest: Manifest): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of Object.entries(manifest.workspace?.dependencies ?? {})) {
    const dep = Dependency.safeParse(value);
    if (dep.success && dep.data.path !== undefined) {
      out.set(name, resolve(dir, dep.data.path));
    }
  }
  return out;
}

function inheritedAt(dir: string, manifests: ReadonlyMap<string, Manifest>) {
  for (let at = dir; at.startsWith(root); at = dirname(at)) {
    const manifest = manifests.get(at);
    if (manifest?.workspace) {
      return inheritedPaths(at, manifest);
    }
  }
  return new Map<string, string>();
}

function dependencyDirs(dir: string, manifests: ReadonlyMap<string, Manifest>): string[] {
  const inherited = inheritedAt(dir, manifests);
  const at = (name: string, value: unknown) => {
    const dep = Dependency.safeParse(value);
    if (!dep.success) {
      return undefined;
    }
    if (dep.data.workspace) {
      return inherited.get(name);
    }
    return dep.data.path === undefined ? undefined : resolve(dir, dep.data.path);
  };
  const manifest = manifests.get(dir);
  return manifest ? declared(manifest).flatMap(([name, value]) => at(name, value) ?? []) : [];
}

function readManifests(list: readonly Node[]): Map<string, Manifest> {
  const dirs = git(['ls-files', '*Cargo.toml'])
    .split('\n')
    .filter(Boolean)
    .map((file) => dirname(join(root, file)))
    .filter((dir) => owner(list, dir) !== undefined);
  return new Map(
    dirs.map((dir) => [
      dir,
      Manifest.parse(parseToml(readFileSync(join(dir, 'Cargo.toml'), 'utf8'))),
    ]),
  );
}

/**
 * Which nodes each one path-depends on, read from every tracked `Cargo.toml`,
 * a server crate's inherited `workspace = true` entries resolved through the
 * server's manifest. Cargo has no cross-workspace view, and these edges are
 * what decide whether a change in one crate can break a module.
 */
export function dependencyGraph(list = nodes()): Graph {
  const manifests = readManifests(list);
  const graph = new Map(list.map((node) => [node.id, new Set<string>()]));
  for (const dir of manifests.keys()) {
    const from = owner(list, dir) ?? '';
    for (const to of dependencyDirs(dir, manifests).map((at) => owner(list, at))) {
      if (to !== undefined && to !== from) {
        graph.get(from)?.add(to);
      }
    }
  }
  return Object.fromEntries([...graph].map(([id, deps]) => [id, [...deps]]));
}
