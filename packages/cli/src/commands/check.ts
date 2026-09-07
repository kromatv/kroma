import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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
      out.push(`${label}: '${spec}' is the kit's private alias; import from '@kroma/ui/kit'`);
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

/** `kroma check`: every manifest valid and unique, the frontend typed and its
 *  imports in bounds, the crate clean under clippy. */
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

  for (const project of projects) {
    console.log(`\n${style.bold(project.manifest.id)}`);
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
