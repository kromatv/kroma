import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as p from '@clack/prompts';
import { REVERSE_DNS_ID } from '@kromatv/registry';
import { exec } from '../exec';
import {
  type Answers,
  type Kind,
  manifestFor,
  packageJsonFor,
  repoRoot,
  skipInRepo,
  slugOf,
  templateVars,
  treesFor,
  tsconfigFor,
  versions,
} from '../scaffold/plan';
import { renderTree } from '../scaffold/render';
import { style } from '../style';

export interface CreateOptions {
  dir?: string;
  id?: string;
  name?: string;
  description?: string;
  kind?: string;
  storage?: boolean;
  inRepo?: boolean;
  install?: boolean;
  yes?: boolean;
  cwd?: string;
}

const KINDS: { value: Kind; label: string; hint: string }[] = [
  {
    value: 'full',
    label: 'A page and a sidecar',
    hint: 'a React page in the admin, a Rust process behind it',
  },
  { value: 'server', label: 'A sidecar only', hint: 'a Rust process, no page' },
  { value: 'ui', label: 'A page only', hint: 'a React page over the core API' },
];

function isKind(v: string | undefined): v is Kind {
  return v === 'full' || v === 'server' || v === 'ui';
}

function isBareId(dir: string): boolean {
  return !dir.includes('/') && REVERSE_DNS_ID.test(dir);
}

function idIssue(id: string): string | undefined {
  return REVERSE_DNS_ID.test(id) ? undefined : 'a reverse-DNS id, lowercase: tv.acme.notes';
}

function titleOf(id: string): string {
  const slug = slugOf(id);
  return slug.charAt(0).toUpperCase() + slug.slice(1).replaceAll('-', ' ');
}

async function answer<T>(value: T | symbol): Promise<T> {
  if (p.isCancel(value)) throw new Error('cancelled');
  return value as T;
}

async function ask(options: CreateOptions, cwd: string): Promise<Answers> {
  const inRepo = options.inRepo ?? repoRoot(cwd) !== null;
  const given = options.id ?? (options.dir && isBareId(options.dir) ? options.dir : undefined);
  if (options.yes) {
    if (!given) throw new Error('--yes needs an id: kroma create tv.acme.notes --yes');
    return {
      id: given,
      name: options.name ?? titleOf(given),
      description: options.description ?? '',
      kind: isKind(options.kind) ? options.kind : 'full',
      storage: options.storage ?? false,
      inRepo,
    };
  }
  p.intro(`${style.bold('KROMA')} module`);
  const id =
    given && !idIssue(given)
      ? given
      : await answer(
          await p.text({
            message: 'Module id',
            placeholder: 'tv.acme.notes',
            initialValue: given,
            validate: (v) => idIssue(v ?? ''),
          }),
        );
  const name =
    options.name ??
    (await answer(await p.text({ message: 'Display name', initialValue: titleOf(id) })));
  const description =
    options.description ??
    (await answer(await p.text({ message: 'One line about it', defaultValue: '' })));
  const kind = isKind(options.kind)
    ? options.kind
    : await answer(await p.select<Kind>({ message: 'What is it?', options: KINDS }));
  const storage =
    kind === 'ui'
      ? false
      : (options.storage ??
        (await answer(
          await p.confirm({
            message: 'Does the sidecar keep its own database?',
            initialValue: false,
          }),
        )));
  return { id, name, description, kind, storage, inRepo };
}

function write(target: string, rel: string, value: unknown): void {
  writeFileSync(join(target, rel), `${JSON.stringify(value, null, 2)}\n`);
}

function targetFor(options: CreateOptions, id: string, cwd: string, repo: string | null): string {
  const explicit = options.dir && !isBareId(options.dir) ? resolve(cwd, options.dir) : null;
  return explicit ?? (repo ? join(repo, 'modules', id) : join(cwd, id));
}

function scaffold(
  a: Answers,
  target: string,
  repo: string | null,
  cwd: string,
): { written: string[]; hasPackage: boolean } {
  const v = versions(cwd);
  const vars = templateVars(a, v);
  const written: string[] = [];
  for (const tree of treesFor(a.kind)) {
    for (const rel of renderTree(tree, target, vars)) {
      if (a.inRepo && skipInRepo(rel)) {
        rmSync(join(target, rel), { force: true });
        continue;
      }
      written.push(rel);
    }
  }
  write(target, 'module.json', manifestFor(a, v));
  written.push('module.json');
  const pkg = packageJsonFor(a, v);
  if (pkg) {
    write(target, 'package.json', pkg);
    const depth = repo ? relative(repo, target).split('/').length : 0;
    write(target, 'tsconfig.json', tsconfigFor(a, depth));
    written.push('package.json', 'tsconfig.json');
  }
  return { written, hasPackage: pkg !== null };
}

async function install(quiet: boolean, inRepo: boolean, cwd: string): Promise<boolean> {
  const s = quiet ? null : p.spinner();
  s?.start(inRepo ? 'bun install (workspace links)' : 'bun install');
  const result = await exec('bun', ['install'], { cwd, quiet: true });
  if (result.exitCode !== 0) {
    s?.stop('bun install failed');
    console.error(result.stderr);
    return false;
  }
  s?.stop('installed');
  return true;
}

function nextSteps(where: string, inRepo: boolean): string {
  return [
    ...(where === '.' ? [] : [`cd ${where}`]),
    ...(inRepo ? [] : ['bunx kroma login http://localhost:4040']),
    'bunx kroma dev',
  ].join('\n');
}

/** `kroma create [dir]`: a module project from a few answers, installed and
 *  ready for `kroma dev`. Inside this repository it lands under `modules/`
 *  with workspace links instead. */
export async function createCommand(options: CreateOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const a = await ask(options, cwd);
  const repo = a.inRepo ? repoRoot(cwd) : null;
  const target = targetFor(options, a.id, cwd, repo);
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} exists and is not empty`);
  }
  mkdirSync(target, { recursive: true });
  const { written, hasPackage } = scaffold(a, target, repo, cwd);

  const where = relative(cwd, target) || '.';
  const quiet = options.yes === true;
  if (quiet) console.log(`created ${a.id} in ${where} (${written.length} files)`);
  else p.log.success(`${a.id} in ${where}`);

  const wanted = options.install !== false && hasPackage;
  if (wanted && !(await install(quiet, a.inRepo, repo ?? target))) return 1;

  if (quiet) {
    console.log(nextSteps(where, a.inRepo));
  } else {
    p.note(nextSteps(where, a.inRepo), 'next');
    p.outro('done');
  }
  return 0;
}
