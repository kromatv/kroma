import { matchesAny } from './glob';

/** Each workspace id and the ids of the workspaces it path-depends on. */
export type Graph = Readonly<Record<string, readonly string[]>>;

/** One parallel Rust job: a name for its check and the workspaces it runs. */
export interface Shard {
  name: string;
  workspaces: string[];
}

const EVERY = [
  'rust-toolchain.toml',
  '.github/workflows/ci.yml',
  'packages/ci-tools/**',
  'packages/cli/**',
];
const MODULE = /^modules\/([^/]+)\//;

/** Whether a changed file reaches every workspace: the toolchain, the CI workflow and the tools that run it. */
export const reachesEvery = (file: string) => matchesAny(file, EVERY);

/**
 * The workspace a changed file belongs to, or null for a file no Rust build
 * reads. The core catalogs are the server's, which embeds them.
 */
export function workspaceOf(file: string): string | null {
  if (file.startsWith('server/') || file.startsWith('packages/core/src/locales/')) return 'server';
  return MODULE.exec(file)?.[1] ?? null;
}

/**
 * Every workspace a change can break: the ones it touches, and every one that
 * path-depends on those, transitively. A module path-depends on the server's
 * crates, so a server change reaches all of them; a module change reaches
 * itself and whatever links it.
 */
export function affected(files: readonly string[] | 'all', graph: Graph): string[] {
  const ids = Object.keys(graph);
  if (files === 'all') return ids;
  const hit = new Set<string>();
  if (files.some(reachesEvery)) return ids;
  for (const file of files) {
    const ws = workspaceOf(file);
    if (ws !== null && ws in graph) hit.add(ws);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of ids) {
      if (!hit.has(id) && (graph[id] ?? []).some((dep) => hit.has(dep))) {
        hit.add(id);
        grew = true;
      }
    }
  }
  return ids.filter((id) => hit.has(id));
}

/**
 * The parallel jobs for `ids`: the server on its own, since it is the largest
 * build, and the modules in groups of at most `size`, in the order given.
 */
export function shards(ids: readonly string[], size = 5): Shard[] {
  const out: Shard[] = ids.includes('server') ? [{ name: 'server', workspaces: ['server'] }] : [];
  const modules = ids.filter((id) => id !== 'server');
  for (let i = 0; i < modules.length; i += size) {
    out.push({ name: `modules ${i / size + 1}`, workspaces: modules.slice(i, i + size) });
  }
  return out;
}
