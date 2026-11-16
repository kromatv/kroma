import { z } from 'zod';
import type { LinguaConfig } from '#site/core/config';
import type { Edit, FileRow, Project, Proposal, Store, User } from '#site/store/store';
import { type GitHub, GitHubError, type Write } from './client';
import { rewrite, type Target, targetsFor } from './plan';
import { blobTexts } from './sync';

const Sha = z.string().regex(/^[0-9a-f]{40}$/);
const Ref = z.object({ object: z.object({ sha: Sha }) });
const Commit = z.object({ sha: Sha, tree: z.object({ sha: Sha }) });
const Created = z.object({ sha: Sha });
const Pull = z.object({ number: z.number(), html_url: z.string() });
const Paths = z.object({
  repository: z.record(z.string(), z.object({ oid: Sha.optional() }).nullable()),
});

/** What a contributor's proposal came to: the pull request carrying it, or nothing left to send. */
export type Outcome = { kind: 'proposed'; proposal: Proposal } | { kind: 'nothing' };

/** Everything a proposal is built from. The project must be freshly synced. */
export interface Proposing {
  project: Project;
  config: LinguaConfig;
  files: readonly FileRow[];
  user: User;
  locale: string;
  origin: string;
  now: number;
}

interface At {
  gh: GitHub;
  repo: string;
}

interface Head {
  sha: string;
  tree: string;
}

interface Start {
  existed: boolean;
  base: Head;
  current: Map<string, string>;
}

/** The branch one contributor's suggestions for one language ride on. */
export function branchFor(login: string, locale: string): string {
  return `lingua/${login.toLowerCase()}/${locale}`;
}

/** The address GitHub credits a commit to without publishing anybody's email. */
export function noreplyEmail(user: Pick<User, 'id' | 'login'>): string {
  return `${user.id}+${user.login}@users.noreply.github.com`;
}

async function refHead(at: At, branch: string): Promise<string | null> {
  try {
    return (await at.gh.get(`/repos/${at.repo}/git/ref/heads/${branch}`, Ref)).object.sha;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function catchUp(at: At, branch: string, head: string): Promise<Head> {
  const message = `Merge the default branch into ${branch}`;
  await at.gh.send(
    {
      method: 'POST',
      path: `/repos/${at.repo}/merges`,
      body: { base: branch, head, commit_message: message },
    },
    z.unknown(),
  );
  const sha = await refHead(at, branch);
  if (!sha) {
    throw new Error(`branch ${branch} vanished`);
  }
  const commit = await at.gh.get(`/repos/${at.repo}/git/commits/${sha}`, Commit);
  return { sha, tree: commit.tree.sha };
}

async function textsAt(
  at: At,
  sha: string,
  paths: readonly string[],
): Promise<Map<string, string>> {
  const [owner, name] = at.repo.split('/');
  const fields = paths.map((path, i) => {
    const expression = JSON.stringify(sha + ':' + path);
    return `p${i}: object(expression: ${expression}) { ... on Blob { oid } }`;
  });
  const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields.join('\n')} } }`;
  const data = await at.gh.graphql(query, Paths, { owner, name });
  const oids = paths.flatMap((path, i): [string, string][] => {
    const oid = data.repository[`p${i}`]?.oid;
    return oid ? [[path, oid]] : [];
  });
  const texts = await blobTexts(
    at.gh,
    at.repo,
    oids.map(([, oid]) => oid),
  );
  return new Map(
    oids.flatMap(([path, oid]): [string, string][] => {
      const text = texts.get(oid);
      return text === undefined ? [] : [[path, text]];
    }),
  );
}

async function startingPoint(
  at: At,
  branch: string,
  plan: { head: Head; input: Proposing; targets: readonly Target[] },
): Promise<Start> {
  const existing = await refHead(at, branch);
  if (!existing) {
    const own = plan.input.files.filter((f) => f.locale === plan.input.locale);
    return { existed: false, base: plan.head, current: new Map(own.map((f) => [f.path, f.body])) };
  }
  const base = await catchUp(at, branch, plan.head.sha);
  return {
    existed: true,
    base,
    current: await textsAt(
      at,
      base.sha,
      plan.targets.map((t) => t.path),
    ),
  };
}

function treeOf(start: Start, files: readonly { path: string; content: string }[]) {
  return {
    base_tree: start.base.tree,
    tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.content })),
  };
}

async function commitFiles(
  at: At,
  start: Start,
  change: { files: { path: string; content: string }[]; message: string; author: object },
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

function changeFor(
  input: Proposing,
  edits: readonly Edit[],
  files: { path: string; content: string }[],
) {
  const count = edits.length;
  const { user } = input;
  return {
    files,
    message: `i18n(${input.locale}): ${count} ${count === 1 ? 'message' : 'messages'} from Lingua`,
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
  step: { start: Start; change: ReturnType<typeof changeFor> },
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

/**
 * Send a contributor's open edits for a language to GitHub: one commit,
 * authored by them, on their branch, which catches up with the default branch
 * first, and one rolling pull request opened by the App.
 */
export async function propose(gh: GitHub, store: Store, input: Proposing): Promise<Outcome> {
  const { project, user, locale } = input;
  const edits = await store.edits(project.id, user.id, locale);
  const targets = targetsFor({ config: input.config, files: input.files, edits, locale });
  if (targets.length === 0 || !project.headSha || !project.treeSha) {
    return { kind: 'nothing' };
  }
  const at = { gh, repo: project.id };
  const branch = branchFor(user.login, locale);
  const start = await startingPoint(at, branch, {
    head: { sha: project.headSha, tree: project.treeSha },
    input,
    targets,
  });
  const change = changeFor(input, edits, rewrite(targets, start.current));
  if (change.files.length === 0 && !start.existed) {
    await Promise.all(edits.map((e) => store.deleteEdit(e)));
    return { kind: 'nothing' };
  }
  const head = await publish(at, branch, { start, change });
  const pull = await ensurePull(at, branch, input);
  return settle(store, input, { branch, pull, head });
}
