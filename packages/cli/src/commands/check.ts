import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  dependenciesOf,
  type Manifest,
  notificationsProblem,
  optionalDependenciesOf,
  satisfies,
} from '@kromatv/registry';
import { z } from 'zod';
import { cargo, targetDir } from '../cargo';
import { exec } from '../exec';
import { findProjects, type Project } from '../project';
import { style } from '../style';

export interface CheckOptions {
  dirs: readonly string[];
  rust?: boolean;
  ts?: boolean;
  cwd?: string;
}

/** The module specifier an `import` or `export ... from` line names, else null. */
export function specifierOf(line: string): string | null {
  const t = line.trim();
  if (!t.startsWith('import') && !t.startsWith('export')) return null;
  const end = Math.max(t.lastIndexOf("'"), t.lastIndexOf('"'));
  if (end < 0) return null;
  const quote = t[end] ?? "'";
  const start = t.lastIndexOf(quote, end - 1);
  if (start < 0) return null;
  const before = t.slice(0, start).trimEnd();
  if (!before.endsWith(' from') && before !== 'import') return null;
  return t.slice(start + 1, end);
}

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

/** Imports a module's frontend must not make: the kit's private alias, and a
 *  relative path that walks out of the module. */
export function importProblems(file: string, code: string, projectDir: string): string[] {
  const out: string[] = [];
  const label = relative(projectDir, file);
  for (const line of code.split('\n')) {
    const spec = specifierOf(line);
    if (spec === null) continue;
    if (spec.startsWith('#ui/')) {
      out.push(`${label}: '${spec}' is the kit's private alias; import from '@kromatv/ui/kit'`);
    } else if (spec.startsWith('.')) {
      const target = join(dirname(file), spec);
      if (relative(projectDir, target).startsWith('..')) {
        out.push(`${label}: '${spec}' reaches outside the module`);
      }
    }
  }
  return out;
}

async function checkTs(project: Project): Promise<string[]> {
  if (!project.ui) return [];
  const tsconfigDir = [project.dir, project.ui.dir].find((d) =>
    existsSync(join(d, 'tsconfig.json')),
  );
  const problems = sources(join(project.ui.dir, 'src')).flatMap((f) =>
    importProblems(f, readFileSync(f, 'utf8'), project.dir),
  );
  if (!tsconfigDir)
    return [...problems, `${project.manifest.id}: no tsconfig.json beside the frontend`];
  const tsc = await exec('bun', ['x', 'tsc', '--noEmit', '-p', tsconfigDir], { cwd: tsconfigDir });
  if (tsc.exitCode !== 0) problems.push(`${project.manifest.id}: tsc failed`);
  return problems;
}

/** A declared range no peer in this tree satisfies. A module's real contract is
 *  the point it consumes, but a range is what the Store resolves an install
 *  against, so one that has rotted past its peer blocks the update rather than
 *  the peer. Peers ship on their own tags, so nothing else notices. */
export function unsatisfiableRanges(projects: readonly Project[]): string[] {
  const version = new Map(projects.map((p) => [p.manifest.id, p.manifest.version]));
  const problems: string[] = [];
  for (const p of projects) {
    const declared = { ...dependenciesOf(p.manifest), ...optionalDependenciesOf(p.manifest) };
    for (const [dep, range] of Object.entries(declared)) {
      const have = version.get(dep);
      if (have === undefined || satisfies(have, range)) continue;
      problems.push(`${p.manifest.id}: needs ${dep}@${range} but this tree has ${have}`);
    }
  }
  return problems;
}

const Catalog = z.record(z.string(), z.unknown());
type Catalogs = Readonly<Record<string, z.infer<typeof Catalog>>>;

function catalogsOf(dir: string): Catalogs {
  const at = join(dir, 'locales');
  if (!existsSync(at)) return {};
  const files = readdirSync(at).filter((name) => name.endsWith('.json'));
  return Object.fromEntries(
    files.map((name) => [
      name.slice(0, -'.json'.length),
      Catalog.parse(JSON.parse(readFileSync(join(at, name), 'utf8'))),
    ]),
  );
}

/** What a module's declared notification types get wrong: a type outside its
 *  namespace or declared twice, and a key one of the catalogs it ships has no
 *  words for. `catalogs` maps a locale to its parsed `locales/<code>.json`. */
export function notificationProblems(manifest: Manifest, catalogs: Catalogs): string[] {
  const declared = manifest.notifications ?? [];
  if (declared.length === 0) return [];
  const id = manifest.id;
  const named = notificationsProblem(id, declared);
  const problems = named === null ? [] : [`${id}: ${named}`];
  const locales = Object.entries(catalogs);
  if (locales.length === 0) problems.push(`${id}: declares notifications but ships no locales`);
  for (const type of declared) {
    const keys = new Set([type.titleKey, type.bodyKey, type.labelKey ?? type.titleKey]);
    for (const key of keys) {
      for (const [locale, catalog] of locales) {
        if (key in catalog || `${key}_other` in catalog) continue;
        problems.push(`${id}: ${type.type} names "${key}", which locales/${locale}.json lacks`);
      }
    }
  }
  return problems;
}

/** `kroma check`: every manifest valid and unique, its notification types
 *  worded in every catalog, the frontend typed and its imports in bounds, the
 *  crate clean under clippy. */
export async function checkCommand(options: CheckOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const projects = findProjects(options.dirs, cwd);
  const dir = targetDir(cwd, projects);
  const problems: string[] = [];

  const seen = new Map<string, string>();
  for (const p of projects) {
    const first = seen.get(p.manifest.id);
    if (first) problems.push(`duplicate module id "${p.manifest.id}" in ${first} and ${p.dir}`);
    seen.set(p.manifest.id, p.dir);
  }
  problems.push(...unsatisfiableRanges(projects));

  for (const project of projects) {
    console.log(`\n${style.bold(project.manifest.id)}`);
    problems.push(...notificationProblems(project.manifest, catalogsOf(project.dir)));
    if (options.ts !== false) problems.push(...(await checkTs(project)));
    if (options.rust !== false && project.server) {
      const code = await cargo(
        project.server.dir,
        ['clippy', '--all-targets', '--', '-D', 'warnings'],
        dir,
      );
      if (code !== 0) problems.push(`${project.manifest.id}: clippy failed`);
    }
  }

  if (problems.length > 0) {
    const count = `${problems.length} problem(s)`;
    console.error(`\n${style.red(count)}`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`\n${style.green('every check passed')} (${projects.length} module(s))`);
  return 0;
}
