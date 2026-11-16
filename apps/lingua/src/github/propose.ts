import { z } from 'zod';
import { pathOf } from '#site/core/config';
import { type Change, planSend, type Work } from '#site/core/plan';
import { type Shelf, shelfOf } from '#site/core/shelf';
import type { FileRow, Project, Proposal, Store, User } from '#site/store/store';
import { type At, catchUp, type Head, refHead, textsAt } from './branch';
import type { GitHub, Write } from './client';

const Sha = z.string().regex(/^[0-9a-f]{40}$/);
const Created = z.object({ sha: Sha });
const Pull = z.object({ number: z.number(), html_url: z.string() });

/** What a contributor's send came to: the pull request carrying it, nothing left to send, or plural forms sent without their general form. */
export type Outcome =
  | { kind: 'proposed'; proposal: Proposal }
  | { kind: 'nothing' }
  | { kind: 'incomplete'; keys: string[] };

/** Everything a proposal is built from: the project, freshly synced, and the files of its i18n folder under `root`. */
export interface Proposing {
  project: Project;
  root: string;
  files: readonly FileRow[];
  user: User;
  locale: string;
  origin: string;
  now: number;
}

interface Starting {
  existed: boolean;
  base: Head;
  shelf: Shelf;
}

/** The branch one contributor's suggestions for one language ride on. */
export function branchFor(login: string, locale: string): string {
  return `lingua/${login.toLowerCase()}/${locale}`;
}

/** The address GitHub credits a commit to without publishing anybody's email. */
export function noreplyEmail(user: Pick<User, 'id' | 'login'>): string {
  return `${user.id}+${user.login}@users.noreply.github.com`;
}

function pathsToRead(input: Proposing): string[] {
  const { root, locale, files } = input;
  const mirrored = files
    .filter((f) => f.kind === 'catalog')
    .map((f) => pathOf(root, { kind: 'catalog', locale, file: f.file }));
  const lock = pathOf(root, { kind: 'lock', locale, file: '' });
  return [...new Set([...files.map((f) => f.path), ...mirrored, lock])];
}

async function startingPoint(
  at: At,
  branch: string,
  plan: { head: Head; input: Proposing },
): Promise<Starting> {
  const { input } = plan;
  const existing = await refHead(at, branch);
  if (!existing) {
    return { existed: false, base: plan.head, shelf: shelfOf(input.root, input.files) };
  }
  const base = await catchUp(at, branch, plan.head.sha);
  const known = new Map(input.files.map((f) => [f.blobSha, f.body]));
  const texts = await textsAt(at, base.sha, { paths: pathsToRead(input), known });
  return { existed: true, base, shelf: { root: input.root, files: texts } };
}

function treeOf(start: Starting, files: readonly Change[]) {
  return {
    base_tree: start.base.tree,
    tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
  };
}

async function commitFiles(
  at: At,
  start: Starting,
  change: { files: Change[]; message: string; author: object },
): Promise<string> {
  const trees: Write = {
    method: 'POST',
    path: `/repos/${at.repo}/git/trees`,
    body: treeOf(start, change.files),
  };
  const tree = await at.gh.send(trees, Created);
  const body = {
    message: change.message,
    tree: tree.sha,
    parents: [start.base.sha],
    author: change.author,
  };
  return (
    await at.gh.send({ method: 'POST', path: `/repos/${at.repo}/git/commits`, body }, Created)
  ).sha;
}

async function moveBranch(
  at: At,
  branch: string,
  move: { sha: string; existed: boolean },
): Promise<void> {
  const update: Write = {
    method: 'PATCH',
    path: `/repos/${at.repo}/git/refs/heads/${branch}`,
    body: { sha: move.sha, force: false },
  };
  const create: Write = {
    method: 'POST',
    path: `/repos/${at.repo}/git/refs`,
    body: { ref: `refs/heads/${branch}`, sha: move.sha },
  };
  const write = move.existed ? update : create;
  await at.gh.send(write, z.unknown());
}

async function ensurePull(at: At, branch: string, input: Proposing): Promise<z.infer<typeof Pull>> {
  const owner = at.repo.split('/')[0] ?? '';
  const open = await at.gh.get(
    `/repos/${at.repo}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`,
    z.array(Pull),
  );
  if (open[0]) {
    return open[0];
  }
  const { user, locale } = input;
  const body = [
    `Suggested by @${user.login} on [Lingua](${input.origin}/${at.repo}/${locale}).`,
    '',
    `This pull request follows their edits: every change they send for \`${locale}\` lands here as a new commit authored by them.`,
  ].join('\n');
  const title = `i18n(${locale}): suggestions from @${user.login}`;
  return at.gh.send(
    {
      method: 'POST',
      path: `/repos/${at.repo}/pulls`,
      body: { title, head: branch, base: input.project.branch, body },
    },
    Pull,
  );
}

function counted(count: number, noun: string): string[] {
  if (count === 0) {
    return [];
  }
  return [`${count} ${count === 1 ? noun : noun + 's'}`];
}

function changeFor(input: Proposing, work: Work, files: Change[]) {
  const { user } = input;
  const parts = [
    ...(work.start ? ['a new language'] : []),
    ...counted(Object.keys(work.edits).length, 'message'),
    ...counted(work.confirms.length, 'confirmation'),
  ];
  return {
    files,
    message: `i18n(${input.locale}): ${parts.join(', ')} from Lingua`,
    author: {
      name: user.name ?? user.login,
      email: noreplyEmail(user),
      date: new Date(input.now * 1000).toISOString(),
    },
  };
}

async function publish(
  at: At,
  branch: string,
  step: { start: Starting; change: ReturnType<typeof changeFor> },
): Promise<string> {
  if (step.change.files.length === 0) {
    return step.start.base.sha;
  }
  const sha = await commitFiles(at, step.start, step.change);
  await moveBranch(at, branch, { sha, existed: step.start.existed });
  return sha;
}

async function settle(
  store: Store,
  input: Proposing,
  sent: { branch: string; pull: z.infer<typeof Pull>; head: string },
): Promise<Outcome> {
  const proposal: Proposal = {
    project: input.project.id,
    userId: input.user.id,
    locale: input.locale,
    branch: sent.branch,
    prNumber: sent.pull.number,
    prUrl: sent.pull.html_url,
    headSha: sent.head,
    updatedAt: input.now,
  };
  await store.saveProposal(proposal);
  await store.markProposed(input.project.id, input.user.id, input.locale);
  return { kind: 'proposed', proposal };
}

async function workOf(store: Store, input: Proposing): Promise<Work> {
  const { project, user, locale } = input;
  const [edits, confirms, starts] = await Promise.all([
    store.edits(project.id, user.id, locale),
    store.confirms(project.id, user.id, locale),
    store.starts(project.id, user.id),
  ]);
  return {
    locale,
    edits: Object.fromEntries(edits.map((e) => [e.key, e.value])),
    confirms: confirms.filter((c) => !c.proposed).map((c) => c.key),
    start: starts.some((s) => s.locale === locale),
  };
}

const idle = (work: Work) =>
  Object.keys(work.edits).length === 0 && work.confirms.length === 0 && !work.start;

/**
 * Send a contributor's edits, confirms and started language to GitHub as one
 * commit authored by them, on their branch, which catches up with the
 * default branch first, and one rolling pull request opened by the App.
 */
export async function propose(gh: GitHub, store: Store, input: Proposing): Promise<Outcome> {
  const { project, user, locale } = input;
  const work = await workOf(store, input);
  if (idle(work) || !project.headSha || !project.treeSha) {
    return { kind: 'nothing' };
  }
  const at = { gh, repo: project.id };
  const branch = branchFor(user.login, locale);
  const head = { sha: project.headSha, tree: project.treeSha };
  const start = await startingPoint(at, branch, { head, input });
  const plan = await planSend(start.shelf, work);
  if (plan.incomplete.length > 0) {
    return { kind: 'incomplete', keys: plan.incomplete };
  }
  if (plan.changes.length === 0 && !start.existed) {
    await store.dropUnsent(project.id, user.id, locale);
    return { kind: 'nothing' };
  }
  const sha = await publish(at, branch, { start, change: changeFor(input, work, plan.changes) });
  const pull = await ensurePull(at, branch, input);
  return settle(store, input, { branch, pull, head: sha });
}
