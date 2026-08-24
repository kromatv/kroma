import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph, Project } from '../core/graph';

// Read a repo into a Graph. This is the only filesystem-touching code; the graph
// algorithms operate on its output, not on disk. Conventions are Kroma's but
// obvious: a Rust server, JS workspaces, and `.kmod` modules under modules/.

interface LoadOptions {
  root: string;
  // Directories to scan for JS `package.json` projects.
  workspaceRoots?: string[];
  serverManifest?: string;
  modulesDir?: string;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function subdirs(root: string, rel: string): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${rel}/${e.name}`);
}

// `engines: { "<name>": "<range>" }`, as a module declares what its host must be.
function engineRange(engines: unknown, name: string): string | undefined {
  if (!engines || typeof engines !== 'object' || Array.isArray(engines)) return undefined;
  const value = (engines as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

function cargoVersion(text: string): string {
  return /^version[ \t]*=[ \t]*"([^"]+)"/m.exec(text)?.[1] ?? '0.0.0';
}

// The Rust server, when the tree has one.
function serverProject(root: string, manifest: string): Project | undefined {
  const path = join(root, manifest);
  if (!existsSync(path)) return undefined;
  return {
    name: 'server',
    dir: manifest.replace(/\/Cargo\.toml$/, ''),
    manifest,
    version: cargoVersion(readFileSync(path, 'utf8')),
    deps: [],
  };
}

// Every JS workspace project, with its edges resolved in a second pass: a
// dependency is "internal" only when it names another project in this graph.
function npmProjects(root: string, workspaceRoots: string[]): Project[] {
  const found: Array<{ project: Project; rawDeps: string[] }> = [];
  for (const wsRoot of workspaceRoots) {
    for (const dir of subdirs(root, wsRoot)) {
      const pkg = readJson(join(root, dir, 'package.json'));
      if (!pkg || typeof pkg.name !== 'string') continue;
      const deps = {
        ...(pkg.dependencies as Record<string, string> | undefined),
        ...(pkg.devDependencies as Record<string, string> | undefined),
      };
      found.push({
        project: {
          name: pkg.name,
          dir,
          manifest: `${dir}/package.json`,
          version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
          deps: [],
        },
        rawDeps: Object.keys(deps),
      });
    }
  }
  const names = new Set(found.map((n) => n.project.name));
  return found.map(({ project, rawDeps }) => ({
    ...project,
    deps: rawDeps.filter((d) => names.has(d)),
  }));
}

// `.kmod` modules: version, dependency ranges, and the host it needs.
function moduleProjects(root: string, modulesDir: string): Project[] {
  const out: Project[] = [];
  for (const dir of subdirs(root, modulesDir)) {
    const manifest = readJson(join(root, dir, 'module.json'));
    if (!manifest || typeof manifest.id !== 'string') continue;
    const declared = manifest.dependencies;
    const ranges =
      declared && !Array.isArray(declared) ? (declared as Record<string, string>) : undefined;
    out.push({
      name: manifest.id,
      dir,
      manifest: `${dir}/module.json`,
      version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
      deps: ranges ? Object.keys(ranges) : [],
      ranges,
      serverRange: engineRange(manifest.engines, 'server'),
    });
  }
  return out;
}

export function loadGraph(options: LoadOptions): Graph {
  const {
    root,
    workspaceRoots = ['packages', 'clients', 'apps'],
    serverManifest = 'server/Cargo.toml',
    modulesDir = 'modules',
  } = options;

  const server = serverProject(root, serverManifest);
  const projects = [
    ...(server ? [server] : []),
    ...npmProjects(root, workspaceRoots),
    ...moduleProjects(root, modulesDir),
  ];
  return { projects, server };
}
