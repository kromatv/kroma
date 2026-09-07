import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/** The crates a module links, closed over their dependencies on each other. */
export const CLOSURE = [
  'kroma-module-sdk',
  'kroma-module-runtime',
  'kroma-module-host',
  'kroma-module-manifest',
  'kroma-module-macros',
  'kroma-domain',
  'kroma-http',
  'kroma-db',
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
  const parsed = Bun.TOML.parse(`x = ${text}`) as { x: Record<string, unknown> };
  return parsed.x;
}

/**
 * A member crate's `Cargo.toml` rewritten to stand alone: `*.workspace = true`
 * package fields inlined, `{ workspace = true }` dependencies replaced by the
 * concrete spec, and the `[dev-dependencies]` table dropped (the vendored
 * crates ship to be linked, not tested).
 */
export function standaloneCargoToml(
  text: string,
  ws: z.infer<typeof Workspace>['workspace'],
): string {
  const out: string[] = [];
  const dropped: string[] = [];
  const droppedFeatures: string[] = [];
  let table = '';
  for (const line of text.split('\n')) {
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      table = header[1] ?? '';
      if (table === 'dev-dependencies') continue;
      out.push(line);
      continue;
    }
    if (table === 'dev-dependencies') continue;
    if (table === 'package') {
      const inherited = /^(edition|rust-version|license)\.workspace\s*=\s*true\s*$/.exec(line);
      if (inherited) {
        const key = inherited[1] as 'edition' | 'rust-version' | 'license';
        out.push(`${key} = ${JSON.stringify(ws.package[key])}`);
        continue;
      }
    }
    const dep = WORKSPACE_LINE.exec(line);
    if (dep && /dependencies$/.test(table)) {
      const name = dep[1] ?? '';
      const spec = ws.dependencies[name];
      if (spec === undefined) throw new Error(`${name} is not in [workspace.dependencies]`);
      if (outsideClosure(name, spec)) {
        dropped.push(name);
        continue;
      }
      out.push(`${name} = ${concreteDep(name, parseInline(dep[2] ?? '{}'), spec)}`);
      continue;
    }
    if (table === 'features' && dropped.some((name) => line.includes(`dep:${name}`))) {
      const feature = /^([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1];
      if (feature) droppedFeatures.push(feature);
      continue;
    }
    out.push(line);
  }
  if (droppedFeatures.length > 0) {
    const cfgs = droppedFeatures.map((f) => `'cfg(feature, values(${JSON.stringify(f)}))'`);
    out.push(
      '',
      '[lints.rust]',
      `unexpected_cfgs = { level = "allow", check-cfg = [${cfgs.join(', ')}] }`,
    );
  }
  return out.join('\n');
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
    Bun.TOML.parse(readFileSync(join(options.serverDir, 'Cargo.toml'), 'utf8')),
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
