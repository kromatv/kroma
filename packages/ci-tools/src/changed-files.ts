import { setTimeout as delay } from 'node:timers/promises';
import { $ } from 'bun';
import { z } from 'zod';
import { warning } from './actions';
import type { Event, Repo } from './event';

const NO_COMMIT = '0'.repeat(40);
const PER_PAGE = 100;
const MAX_PAGES = 30;
const ATTEMPTS = 4;
const BACKOFF_MS = 2000;

const FileList = z.array(z.object({ filename: z.string().min(1) }));
const Compare = z.object({ files: FileList.default([]) });

type Changed = string[] | 'all';

async function api(repo: Repo, path: string): Promise<unknown> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'kroma-ci-tools',
    'x-github-api-version': '2022-11-28',
  };
  if (repo.token) headers.authorization = `Bearer ${repo.token}`;
  let failure = '';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await delay(BACKOFF_MS * 2 ** (attempt - 2));
    try {
      const res = await fetch(`https://api.github.com/repos/${repo.slug}${path}`, { headers });
      if (res.ok) return await res.json();
      failure = `answered ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`GitHub ${path} ${failure}`);
}

async function orAll(list: () => Promise<Changed>): Promise<Changed> {
  try {
    return await list();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warning(`${reason}; the change cannot be listed, so every lane runs`);
    return 'all';
  }
}

async function paged(
  repo: Repo,
  path: string,
  read: (body: unknown) => string[],
): Promise<Changed> {
  const files: string[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = read(await api(repo, `${path}per_page=${PER_PAGE}&page=${page}`));
    files.push(...batch);
    if (batch.length < PER_PAGE) return files;
  }
  return 'all';
}

async function pullRequestFiles(repo: Repo, number: number): Promise<Changed> {
  return paged(repo, `/pulls/${number}/files?`, (body) =>
    FileList.parse(body).map((f) => f.filename),
  );
}

async function pushFiles(repo: Repo, before: string, after: string): Promise<Changed> {
  if (before === NO_COMMIT) return 'all';
  return paged(repo, `/compare/${before}...${after}?`, (body) =>
    Compare.parse(body).files.map((f) => f.filename),
  );
}

async function localFiles(base: string): Promise<string[]> {
  const committed = await $`git diff --name-only ${base}...HEAD`.text();
  const pending = await $`git status --porcelain --untracked-files=all`.text();
  const names = new Set<string>();
  for (const line of committed.split('\n')) if (line) names.add(line);
  for (const line of pending.split('\n')) if (line) names.add(line.slice(3).trim());
  return [...names];
}

/**
 * The files a change touches, or `'all'` when they cannot be listed: a push
 * with no parent, a diff GitHub truncates, a GitHub that still fails after its
 * retries, anything that is not a push or a pull request. Off Actions it is
 * the working tree against `base`.
 */
export async function changedFiles(event: Event, repo: () => Repo, base: string): Promise<Changed> {
  switch (event.kind) {
    case 'pull_request': {
      const from = repo();
      return orAll(() => pullRequestFiles(from, event.number));
    }
    case 'push': {
      const from = repo();
      return orAll(() => pushFiles(from, event.before, event.after));
    }
    case 'local':
      return localFiles(base);
    default:
      return 'all';
  }
}
