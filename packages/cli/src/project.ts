import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { Manifest, MODULE_SCHEMA_VERSION, REVERSE_DNS_ID } from '@kromatv/registry';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';
import { byCodeUnit } from './sort';

/** A manifest as it is AUTHORED: strict, so a typo is refused rather than
 *  dropped the way a registry document's would be. */
export const AuthoredManifest = Manifest.strict()
  .refine((m) => m.schemaVersion === MODULE_SCHEMA_VERSION, {
    message: `schemaVersion must be ${MODULE_SCHEMA_VERSION}`,
  })
  .refine((m) => REVERSE_DNS_ID.test(m.id), { message: 'id must be reverse-DNS, lowercase' });

const CargoManifest = z.object({
  package: z.object({
    name: z.string(),
    metadata: z
      .object({ kmod: z.object({ features: z.array(z.string()).default([]) }).optional() })
      .optional(),
  }),
  bin: z.array(z.object({ name: z.string() })).default([]),
});

export interface ServerCrate {
  dir: string;
  crate: string;
  /** The sidecar's binary name; `null` for a library module, which spawns nothing. */
  bin: string | null;
  /** Cargo features the `.kmod` build enables (`[package.metadata.kmod] features`). */
  features: string[];
}

export interface Frontend {
  dir: string;
  /** The file whose default export is the `KromaModule`. */
  entry: string;
}

export interface Project {
  dir: string;
  manifest: Manifest;
  server: ServerCrate | null;
  ui: Frontend | null;
}

const UI_ENTRIES = ['ui/src/module.tsx', 'ui/src/module.ts', 'ui/src/index.tsx', 'ui/src/index.ts'];

function readServer(dir: string): ServerCrate | null {
  const serverDir = join(dir, 'server');
  const cargoPath = join(serverDir, 'Cargo.toml');
  if (!existsSync(cargoPath)) return null;
  const cargo = CargoManifest.parse(parseToml(readFileSync(cargoPath, 'utf8')));
  return {
    dir: serverDir,
    crate: cargo.package.name,
    bin: cargo.bin[0]?.name ?? null,
    features: cargo.package.metadata?.kmod?.features ?? [],
  };
}

function readFrontend(dir: string): Frontend | null {
  const entry = UI_ENTRIES.map((rel) => join(dir, rel)).find((p) => existsSync(p));
  return entry ? { dir: join(dir, 'ui'), entry } : null;
}

function issues(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      const at = i.path.length ? `${i.path.join('.')}: ` : '';
      return `  ${at}${i.message}`;
    })
    .join('\n');
}

/** Reads the module at `dir`, which must hold a `module.json`. */
export function openProject(dir: string): Project {
  const path = join(dir, 'module.json');
  if (!existsSync(path)) {
    throw new Error(`${dir} is not a module: no module.json there`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${path}: invalid JSON (${(e as Error).message})`);
  }
  const read = AuthoredManifest.safeParse(raw);
  if (!read.success) {
    throw new Error(`${path} is not a valid manifest:\n${issues(read.error)}`);
  }
  return { dir, manifest: read.data, server: readServer(dir), ui: readFrontend(dir) };
}

function absolute(path: string, cwd: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

/** Every module directory under `root` (a `modules/` folder), sorted. */
export function moduleDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'module.json')))
    .map((e) => join(root, e.name))
    .sort(byCodeUnit);
}

/**
 * The modules a command runs over: the directories given, else the module the
 * cwd is, else every module under `<cwd>/modules`. One rule for a standalone
 * project and for this repository, where `modules/` holds all of them.
 */
export function findProjects(dirs: readonly string[], cwd = process.cwd()): Project[] {
  if (dirs.length > 0) return dirs.map((d) => openProject(absolute(d, cwd)));
  if (existsSync(join(cwd, 'module.json'))) return [openProject(cwd)];
  const found = moduleDirs(join(cwd, 'modules'));
  if (found.length === 0) {
    throw new Error(`no module here: ${cwd} has no module.json and no modules/ directory`);
  }
  return found.map(openProject);
}

/** True when `cwd` is a directory of modules rather than one module. */
export function isModuleSet(cwd = process.cwd()): boolean {
  return !existsSync(join(cwd, 'module.json')) && moduleDirs(join(cwd, 'modules')).length > 0;
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
