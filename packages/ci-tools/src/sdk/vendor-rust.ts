import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';

/** The crates a module links, closed over their dependencies on each other. */
export const CLOSURE = [
  'kroma-module-sdk',
  'kroma-module-runtime',
  'kroma-module-host',
  'kroma-module-manifest',
  'kroma-module-macros',
  'kroma-module-wire',
  'kroma-sqlite',
  'kroma-http',
  'kroma-i18n',
  'kroma-primitives',
  'kroma-testing',
] as const;

const Dep = z.union([
  z.string(),
  z
    .object({
      version: z.string().optional(),
      path: z.string().optional(),
      features: z.array(z.string()).optional(),
      'default-features': z.boolean().optional(),
      optional: z.boolean().optional(),
      workspace: z.boolean().optional(),
    })
    .loose(),
]);
type Dep = z.infer<typeof Dep>;

const Workspace = z.object({
  workspace: z.object({
    package: z.object({ edition: z.string(), 'rust-version': z.string(), license: z.string() }),
    dependencies: z.record(z.string(), Dep),
  }),
});

function tomlValue(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map(tomlValue).join(', ')}]`;
  throw new Error(`cannot write ${JSON.stringify(v)} as TOML`);
}

function inline(spec: Record<string, unknown>): string {
  const fields = Object.entries(spec)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} = ${tomlValue(v)}`);
  return `{ ${fields.join(', ')} }`;
}

/** The concrete spec a `{ workspace = true, ... }` line stands for: the
 *  workspace's version and features, plus what the member added. Closure crates
 *  become sibling path deps. */
export function concreteDep(name: string, member: Record<string, unknown>, workspace: Dep): string {
  const ws = typeof workspace === 'string' ? { version: workspace } : workspace;
  const { workspace: _, ...rest } = member;
  const spec: Record<string, unknown> = { ...ws, ...rest };
  if ((CLOSURE as readonly string[]).includes(name)) {
    delete spec.version;
    spec.path = `../${name}`;
  } else {
    delete spec.path;
  }
  const features = [
    ...new Set([...(ws.features ?? []), ...((member.features as string[] | undefined) ?? [])]),
  ];
  if (features.length) spec.features = features;
  else delete spec.features;
  return inline(spec);
}

const WORKSPACE_LINE = /^([A-Za-z0-9_-]+)\s*=\s*(\{[^}]*\bworkspace\s*=\s*true\b[^}]*\})\s*$/;

function parseInline(text: string): Record<string, unknown> {
  const parsed = parseToml(`x = ${text}`) as { x: Record<string, unknown> };
  return parsed.x;
}

type Ws = z.infer<typeof Workspace>['workspace'];

function inheritedPackageLine(line: string, ws: Ws): string | null {
  const inherited = /^(edition|rust-version|license)\.workspace\s*=\s*true\s*$/.exec(line);
  if (!inherited) return null;
  const key = inherited[1] as 'edition' | 'rust-version' | 'license';
  return `${key} = ${JSON.stringify(ws.package[key])}`;
}

function workspaceDependency(line: string, ws: Ws): { name: string; line: string | null } | null {
  const dep = WORKSPACE_LINE.exec(line);
  if (!dep) return null;
  const name = dep[1] ?? '';
  const spec = ws.dependencies[name];
  if (spec === undefined) throw new Error(`${name} is not in [workspace.dependencies]`);
  if (outsideClosure(name, spec)) return { name, line: null };
  return { name, line: `${name} = ${concreteDep(name, parseInline(dep[2] ?? '{}'), spec)}` };
}

function lintsForDroppedFeatures(features: readonly string[]): string[] {
  if (features.length === 0) return [];
  const cfgs = features.map((f) => `'cfg(feature, values(${JSON.stringify(f)}))'`);
  return [
    '',
    '[lints.rust]',
    `unexpected_cfgs = { level = "allow", check-cfg = [${cfgs.join(', ')}] }`,
  ];
}

interface Rewrite {
  out: string[];
  comments: string[];
  dropped: string[];
  droppedFeatures: string[];
}

function keep(state: Rewrite, line: string): void {
  state.out.push(...state.comments, line);
  state.comments.length = 0;
}

function takePackageField(line: string, ws: Ws, state: Rewrite): boolean {
  const inherited = inheritedPackageLine(line, ws);
  if (!inherited) return false;
  keep(state, inherited);
  return true;
}

function takeDependency(line: string, ws: Ws, state: Rewrite): boolean {
  const dep = workspaceDependency(line, ws);
  if (!dep) return false;
  if (dep.line) keep(state, dep.line);
  else {
    state.dropped.push(dep.name);
    state.comments.length = 0;
  }
  return true;
}

/** A feature entry that turns a dropped crate on (`"dep:x"`), or turns one of
 *  its features on (`"x/f"`, `"x?/f"`). The first takes the whole feature with
 *  it; the second is one entry among others and only that entry goes. */
function takeFeature(line: string, state: Rewrite): boolean {
  const named = state.dropped.filter(
    (name) =>
      line.includes(`dep:${name}`) || line.includes(`"${name}/`) || line.includes(`"${name}?/`),
  );
  if (named.length === 0) return false;
  if (named.some((name) => line.includes(`dep:${name}`))) {
    const feature = /^([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
    if (feature) state.droppedFeatures.push(feature);
    state.comments.length = 0;
    return true;
  }
  const entry = /"[^"]*"\s*,?\s*/g;
  const kept = line.replaceAll(entry, (match) =>
    named.some((name) => match.includes(`"${name}/`) || match.includes(`"${name}?/`)) ? '' : match,
  );
  keep(state, kept.replace(/,\s*\]/, ']'));
  return true;
}

function rewriteLine(line: string, table: string, ws: Ws, state: Rewrite): void {
  if (table === 'dev-dependencies') return;
  if (line.trimStart().startsWith('#')) {
    state.comments.push(line);
    return;
  }
  if (table === 'package' && takePackageField(line, ws, state)) return;
  if (table.endsWith('dependencies') && takeDependency(line, ws, state)) return;
  if (table === 'features' && takeFeature(line, state)) return;
  keep(state, line);
}

/**
 * A member crate's `Cargo.toml` rewritten to stand alone: `*.workspace = true`
 * package fields inlined, `{ workspace = true }` dependencies replaced by the
 * concrete spec, whatever names a crate outside the closure dropped along with
 * the comment that introduced it, and the `[dev-dependencies]` table gone (the
 * vendored crates ship to be linked, not tested).
 */
export function standaloneCargoToml(text: string, ws: Ws): string {
  const state: Rewrite = { out: [], comments: [], dropped: [], droppedFeatures: [] };
  let table = '';
  for (const line of text.split('\n')) {
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      table = header[1] ?? '';
      if (table !== 'dev-dependencies') keep(state, line);
      continue;
    }
    rewriteLine(line, table, ws, state);
  }
  state.out.push(...state.comments);
  while (state.out.at(-1) === '') state.out.pop();
  state.out.push(...lintsForDroppedFeatures(state.droppedFeatures));
  return `${state.out.join('\n')}\n`;
}

/** A repository crate that is not vendored: a path-only workspace dependency
 *  outside the closure (the engine behind the SDK's in-repo `engine` feature). */
function outsideClosure(name: string, spec: Dep): boolean {
  if ((CLOSURE as readonly string[]).includes(name)) return false;
  return typeof spec !== 'string' && spec.path !== undefined && spec.version === undefined;
}

export interface VendorOptions {
  /** The repository's `server/` directory. */
  serverDir: string;
  /** Where the crates land: `packages/module-sdk/rust`. */
  outDir: string;
  /** The version every vendored crate carries (the SDK's own). */
  version: string;
}

/** Copies the closure out of `server/crates` as a self-contained cargo
 *  workspace, so a module outside this repository path-depends on it from
 *  inside `node_modules`. */
export function vendorRust(options: VendorOptions): string[] {
  const workspace = Workspace.parse(
    parseToml(readFileSync(join(options.serverDir, 'Cargo.toml'), 'utf8')),
  );
  rmSync(options.outDir, { recursive: true, force: true });
  mkdirSync(options.outDir, { recursive: true });
  const written: string[] = [];
  for (const crate of CLOSURE) {
    const from = join(options.serverDir, 'crates', crate);
    if (!existsSync(from)) throw new Error(`no crate at ${from}`);
    const to = join(options.outDir, crate);
    cpSync(from, to, {
      recursive: true,
      filter: (src) => !/\/(target|tests|benches)(\/|$)/.test(src),
    });
    const manifest = standaloneCargoToml(
      readFileSync(join(to, 'Cargo.toml'), 'utf8'),
      workspace.workspace,
    ).replace(/^version\s*=\s*"[^"]*"/m, `version = ${JSON.stringify(options.version)}`);
    writeFileSync(join(to, 'Cargo.toml'), manifest);
    written.push(crate);
  }
  writeFileSync(
    join(options.outDir, 'Cargo.toml'),
    `[workspace]\nresolver = "2"\nmembers = [${CLOSURE.map((c) => JSON.stringify(c)).join(', ')}]\n`,
  );
  return written;
}
