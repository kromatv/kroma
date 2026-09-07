import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as p from '@clack/prompts';
import { REVERSE_DNS_ID } from '@kroma/registry';
import { $ } from 'bun';
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
  dir?: string | undefined;
  id?: string | undefined;
  name?: string | undefined;
  description?: string | undefined;
  kind?: string | undefined;
  storage?: boolean | undefined;
  inRepo?: boolean | undefined;
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
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
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

/** `kroma create [dir]`: a module project from a few answers, installed and
 *  ready for `kroma dev`. Inside this repository it lands under `modules/`
 *  with workspace links instead. */
export async function createCommand(options: CreateOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const a = await ask(options, cwd);
  const repo = a.inRepo ? repoRoot(cwd) : null;
  const explicit = options.dir && !isBareId(options.dir) ? resolve(cwd, options.dir) : null;
  const target = explicit ?? (repo ? join(repo, 'modules', a.id) : join(cwd, a.id));
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`${target} exists and is not empty`);
  }
  mkdirSync(target, { recursive: true });

  const v = versions(cwd);
  const vars = templateVars(a, v);
  const written: string[] = [];
  for (const tree of treesFor(a.kind)) {
    for (const rel of renderTree(tree, target, vars)) {
      if (a.inRepo && skipInRepo(rel)) {
        await $`rm -f ${join(target, rel)}`.quiet();
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
    write(
      target,
      'tsconfig.json',
      tsconfigFor(a, repo ? relative(repo, target).split('/').length : 0),
    );
    written.push('package.json', 'tsconfig.json');
  }

  const where = relative(cwd, target) || '.';
  if (options.yes) {
    console.log(`created ${a.id} in ${where} (${written.length} files)`);
  } else {
    p.log.success(`${a.id} in ${where}`);
  }

  const install = options.install !== false && pkg !== null;
  if (install) {
    const s = options.yes ? null : p.spinner();
    s?.start(a.inRepo ? 'bun install (workspace links)' : 'bun install');
    const result = await $`bun install`
      .cwd(repo ?? target)
      .quiet()
      .nothrow();
    if (result.exitCode !== 0) {
      s?.stop('bun install failed');
      console.error(result.stderr.toString());
      return 1;
    }
    s?.stop('installed');
  }

  const next = [
    ...(where === '.' ? [] : [`cd ${where}`]),
    ...(a.inRepo ? [] : ['bunx kroma login http://localhost:4040']),
    a.inRepo ? 'bunx kroma dev' : 'bunx kroma dev',
  ];
  if (options.yes) {
    console.log(next.join('\n'));
  } else {
    p.note(next.join('\n'), 'next');
    p.outro('done');
  }
  return 0;
}
