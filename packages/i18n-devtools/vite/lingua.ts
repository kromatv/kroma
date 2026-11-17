import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { ViteDevServer } from 'vite';
import { z } from 'zod';

interface Lingua {
  readonly url: string;
  readonly project: string;
}

type RemoteOf = (repository: string) => Promise<string | null>;

const ASK = 'kroma:i18n:lingua';
const CONFIG = 'lingua.json';
const CHECKOUT = '.git';
const SCP = /^[^@/\s]+@[^:/\s]+:/;
const SEGMENT = /^[\w.-]+$/;
const REMOTES = new Set(['https:', 'ssh:']);

const LinguaConfig = z.object({ url: z.url({ protocol: /^https$/ }) });
const Asked = z.object({ at: z.number() });

const run = promisify(execFile);

async function urlOf(repository: string, remote: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['remote', 'get-url', remote], { cwd: repository });
    return stdout;
  } catch {
    return null;
  }
}

async function canonicalRemote(repository: string): Promise<string | null> {
  return (await urlOf(repository, 'upstream')) ?? urlOf(repository, 'origin');
}

function pathOf(remote: string): string | null {
  const scp = SCP.exec(remote);
  if (scp) {
    return remote.slice(scp[0].length);
  }
  if (!URL.canParse(remote)) {
    return null;
  }
  const url = new URL(remote);
  return REMOTES.has(url.protocol) ? url.pathname : null;
}

/** The `<owner>/<repo>` a git remote names, in its https or its ssh form, or
 *  `null` for one that names no such pair. */
export function projectOf(remote: string): string | null {
  const [owner, name, ...deeper] = (pathOf(remote.trim()) ?? '').split('/').filter(Boolean);
  const repo = name?.replace(/\.git$/, '');
  if (!owner || !repo || deeper.length > 0 || !SEGMENT.test(owner) || !SEGMENT.test(repo)) {
    return null;
  }
  return `${owner}/${repo}`;
}

/** The site a `lingua.json` names, without a trailing slash, or `null` for one
 *  that names none over https. */
export function linguaUrl(config: unknown): string | null {
  const parsed = LinguaConfig.safeParse(config);
  if (!parsed.success) {
    return null;
  }
  const { url } = parsed.data;
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function configAbove(from: string): string | null {
  let dir = from;
  while (!existsSync(join(dir, CONFIG))) {
    const parent = dirname(dir);
    if (parent === dir || existsSync(join(dir, CHECKOUT))) {
      return null;
    }
    dir = parent;
  }
  return join(dir, CONFIG);
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Where the repository holding `root` translates: the `lingua.json` nearest
 *  above it, no higher than the top of its checkout, and the project the
 *  remote of the directory it sits in names. That remote is `upstream` where
 *  the checkout has one, which is how a fork names the repository Lingua
 *  reads, else `origin`. `null` where either is missing. */
export async function findLingua(
  root: string,
  remoteOf: RemoteOf = canonicalRemote,
): Promise<Lingua | null> {
  const config = configAbove(root);
  const url = config && linguaUrl(readJson(config));
  if (!config || !url) {
    return null;
  }
  const remote = await remoteOf(dirname(config));
  const project = remote && projectOf(remote);
  return project ? { url, project } : null;
}

/** The answer to the page's ask for where the repository holding `root`
 *  translates, or `null` for an ask with no `at` to answer under. Worked out
 *  on the first ask, and kept. */
export function linguaAnswers(
  root: string,
  remoteOf: RemoteOf = canonicalRemote,
): (ask: unknown) => Promise<{ at: number; lingua: Lingua | null } | null> {
  let known: Promise<Lingua | null> | null = null;
  return async (ask) => {
    const asked = Asked.safeParse(ask);
    if (!asked.success) {
      return null;
    }
    known ??= findLingua(root, remoteOf);
    return { at: asked.data.at, lingua: await known };
  };
}

/** Answer the page's ask for where this repository translates, for the life of
 *  the dev server. */
export function serveLingua(server: ViteDevServer): void {
  const answer = linguaAnswers(server.config.root);
  server.environments.client.hot.on(ASK, (ask: unknown, client) => {
    void answer(ask).then((said) => {
      if (said) {
        client.send(ASK, said);
      }
    });
  });
}
