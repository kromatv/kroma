import { matchesAny } from './glob';

/**
 * Each node and the nodes it path-depends on. A module workspace is a node by
 * its id; the server is one node per crate, `server:<crate>`, and `server` for
 * the root package and every file outside a crate.
 */
export type Graph = Readonly<Record<string, readonly string[]>>;

/** Which slice of the server workspace a job takes. */
export type ServerPart = 'clippy' | 'core' | 'host';

/** One parallel Rust job: a name for its check and the workspaces it runs. */
export interface Shard {
  name: string;
  workspaces: string[];
  /** On the server only: its lint, its tests, or the tests that run components. */
  part?: ServerPart;
}

/** What one change has to run: the Rust jobs, and the modules each module job takes. */
export interface Reach {
  shards: Shard[];
  /** The modules whose tests run again as components. */
  components: string[];
  /** The modules started alone behind the audit host. */
  audit: string[];
}

const SERVER = 'server';

const SERVER_JOBS: readonly { name: string; part: ServerPart }[] = [
  { name: 'server', part: 'core' },
  { name: 'module host', part: 'host' },
  { name: 'server clippy', part: 'clippy' },
];

const EVERY = [
  'rust-toolchain.toml',
  '.github/workflows/ci.yml',
  'packages/ci-tools/**',
  'packages/cli/**',
];
const MODULE = /^modules\/([^/]+)\//;
const CRATE = /^server\/crates\/([^/]+)\//;

const CATALOGS = 'server:kroma-engine';
const TEST_RUNNER = 'server:kroma-wasm-test-runner';
const AUDIT_HOST = 'server:kroma-module-audit';

const isServer = (node: string) => node === SERVER || node.startsWith(`${SERVER}:`);

/** Whether a changed file reaches every workspace: the toolchain, the CI workflow and the tools that run it. */
export const reachesEvery = (file: string) => matchesAny(file, EVERY);

/**
 * The nodes a changed file belongs to, none for a file no Rust build reads.
 * The core catalogs are kroma-engine's, which embeds them. The server's
 * manifest is every crate's, since each inherits its dependencies from there,
 * and its lockfile is every binary the server workspace builds: the server,
 * the test runner and the audit host, never a module, which locks its own.
 */
export function nodesOf(file: string, graph: Graph): string[] {
  if (file === 'server/Cargo.toml') {
    return Object.keys(graph).filter(isServer);
  }
  if (file === 'server/Cargo.lock') {
    return [SERVER, TEST_RUNNER, AUDIT_HOST];
  }
  if (file.startsWith('packages/core/src/locales/')) {
    return [CATALOGS];
  }
  const owner = ownerOf(file);
  return owner === undefined ? [] : [owner];
}

function ownerOf(file: string): string | undefined {
  const crate = CRATE.exec(file)?.[1];
  if (crate !== undefined) {
    return `${SERVER}:${crate}`;
  }
  return file.startsWith(`${SERVER}/`) ? SERVER : MODULE.exec(file)?.[1];
}

function dependents(start: Iterable<string>, graph: Graph): Set<string> {
  const hit = new Set(start);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, deps] of Object.entries(graph)) {
      if (!hit.has(id) && deps.some((dep) => hit.has(dep))) {
        hit.add(id);
        grew = true;
      }
    }
  }
  return hit;
}

/**
 * Every node a change can break: the ones it touches, and every one that
 * path-depends on those, transitively. A module links a handful of the
 * server's crates, so a change to one of those reaches it, and a change to the
 * engine or the server's own package reaches no module.
 */
export function affected(files: readonly string[] | 'all', graph: Graph): string[] {
  const ids = Object.keys(graph);
  if (files === 'all' || files.some(reachesEvery)) {
    return ids;
  }
  const touched = files.flatMap((file) => nodesOf(file, graph)).filter((id) => id in graph);
  const hit = dependents(touched, graph);
  return ids.filter((id) => hit.has(id));
}

/**
 * The parallel jobs for the workspaces `ids` name: the server in three, since
 * it is the largest build, and every module in one, since a module's own
 * tests take seconds and a runner's setup takes minutes.
 */
export function shards(ids: readonly string[]): Shard[] {
  const out: Shard[] = ids.includes(SERVER)
    ? SERVER_JOBS.map(({ name, part }) => ({ name, workspaces: [SERVER], part }))
    : [];
  const modules = ids.filter((id) => id !== SERVER);
  if (modules.length > 0) {
    out.push({ name: 'modules', workspaces: modules });
  }
  return out;
}

/**
 * The Rust jobs `hit` (from `affected`) asks for. Every module runs again as a
 * component when the test runner or a crate under it moved, and every module
 * goes through the audit when the audit host did.
 */
export function reach(hit: readonly string[], graph: Graph): Reach {
  const every = Object.keys(graph).filter((id) => !isServer(id));
  const modules = hit.filter((id) => !isServer(id));
  const server = hit.some(isServer) ? [SERVER] : [];
  return {
    shards: shards([...server, ...modules]),
    components: hit.includes(TEST_RUNNER) ? every : modules,
    audit: hit.includes(AUDIT_HOST) ? every : modules,
  };
}
