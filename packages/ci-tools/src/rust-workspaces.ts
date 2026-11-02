import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';
import type { Graph } from './rust-affected';
import { root } from './root';

export interface Workspace {
  id: string;
  dir: string;
  targetDir: string | undefined;
}

const KMOD_TARGET_DIR = join(root, 'target/kmod');

const KmodFeatures = z.object({
  package: z
    .object({
      metadata: z
        .object({ kmod: z.object({ features: z.array(z.string()).default([]) }).optional() })
        .optional(),
    })
    .optional(),
});

// What a bundle ships with, checked in a second pass so the default one stays
// cheap. Not `--all-features`, which would ask for builds nobody publishes.
function shippedFeatures(ws: Workspace): string[] {
  if (ws.id === SERVER.id) return [];
  const manifest = join(ws.dir, 'Cargo.toml');
  if (!existsSync(manifest)) return [];
  const read = KmodFeatures.safeParse(parseToml(readFileSync(manifest, 'utf8')));
  return read.success ? (read.data.package?.metadata?.kmod?.features ?? []) : [];
}

export const SERVER: Workspace = { id: 'server', dir: join(root, 'server'), targetDir: undefined };

export function workspaces(): Workspace[] {
  const modules = join(root, 'modules');
  const out = [SERVER];
  const entries = readdirSync(modules, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name === 'lib' ? join(modules, 'lib') : join(modules, entry.name, 'server');
    if (existsSync(join(dir, 'Cargo.toml'))) {
      out.push({ id: entry.name, dir, targetDir: KMOD_TARGET_DIR });
    }
  }
  return out;
}

export const featured = (): Workspace[] =>
  workspaces().filter((ws) => shippedFeatures(ws).length > 0);

export const on = (ws: Workspace): string[] => {
  const features = shippedFeatures(ws);
  return features.length ? ['--features', features.join(',')] : [];
};

const PATH_DEP = /path\s*=\s*"([^"]+)"/g;

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8' });
const git = (args: string[]) => run('git', args);

const owner = (list: readonly Workspace[], at: string) =>
  list
    .filter((ws) => at === ws.dir || at.startsWith(`${ws.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length)[0]?.id;

/**
 * Which workspaces each one path-depends on, read from every tracked
 * `Cargo.toml` in it. Cargo has no cross-workspace view, and these edges are
 * what decide whether a change in one workspace can break another.
 */
export function dependencyGraph(list = workspaces()): Graph {
  const manifests = git(['ls-files', '*Cargo.toml'])
    .split('\n')
    .filter(Boolean)
    .map((file) => join(root, file));
  const graph: Record<string, string[]> = Object.fromEntries(list.map((ws) => [ws.id, []]));
  for (const manifest of manifests) {
    const from = owner(list, dirname(manifest));
    if (!from) continue;
    for (const [, path] of readFileSync(manifest, 'utf8').matchAll(PATH_DEP)) {
      const to = owner(list, resolve(dirname(manifest), path ?? ''));
      if (to && to !== from && !graph[from]?.includes(to)) graph[from]?.push(to);
    }
  }
  return graph;
}
