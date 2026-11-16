import { z } from 'zod';
import { CONFIG_PATH } from '#site/core/config';
import { type GitHub, GitHubError, type Write } from '#site/github/client';
import { forkHead } from '#site/github/lane';
import { discoverInstallation, type Syncing, syncProject } from '#site/github/sync';
import type { Store } from '#site/store/store';

const SIGNATURE = /^sha256=([0-9a-f]{64})$/;

/** Whether `signature` (`X-Hub-Signature-256`) is GitHub's HMAC of `body` under the webhook secret. */
export async function verifySignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  const hex = SIGNATURE.exec(signature ?? '')?.[1];
  if (!hex) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const mac = Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return crypto.subtle.verify('HMAC', key, mac, new TextEncoder().encode(body));
}

const Installation = z.object({ id: z.number() });
const Repository = z.object({ full_name: z.string(), default_branch: z.string() });

const Push = z.object({
  ref: z.string(),
  installation: Installation,
  repository: Repository,
  commits: z.array(z.object({ added: z.array(z.string()), modified: z.array(z.string()) })).default([]),
});

const PullClosed = z.object({
  action: z.literal('closed'),
  installation: Installation,
  repository: Repository,
  pull_request: z.object({
    head: z.object({
      ref: z.string(),
      label: z.string(),
      repo: z.object({ full_name: z.string() }).nullable(),
    }),
  }),
});

const InstallationEvent = z.object({ action: z.string(), installation: Installation });

/** One delivery GitHub sent, already verified. */
export interface Delivery {
  event: string;
  payload: unknown;
}

/** What a delivery is handled with: the store, and a GitHub speaking as one installation of the App. */
export interface Handling {
  connect: (installationId: number) => Promise<GitHub>;
  store: Store;
  now: number;
  branches?: ReadonlyMap<string, string>;
}

/** Find every repository an installation reaches with a `lingua.json`, then sync each one. */
export async function syncInstallation(syncing: Syncing, installationId: number, now: number): Promise<void> {
  await discoverInstallation(syncing, installationId);
  const projects = (await syncing.store.projects()).filter((p) => p.installationId === installationId);
  await Promise.all(projects.map((project) => syncProject(syncing, project, now)));
}

async function onPush({ connect, store, now, branches }: Handling, payload: unknown): Promise<void> {
  const push = Push.safeParse(payload);
  const repository = push.data?.repository;
  const tracked = repository ? (branches?.get(repository.full_name) ?? repository.default_branch) : '';
  if (!push.success || push.data.ref !== `refs/heads/${tracked}`) {
    return;
  }
  const syncing = { gh: await connect(push.data.installation.id), store, branches };
  const known = await store.project(push.data.repository.full_name);
  const touchedConfig = push.data.commits.some((c) => [...c.added, ...c.modified].includes(CONFIG_PATH));
  if (!known || touchedConfig) {
    await discoverInstallation(syncing, push.data.installation.id);
  }
  const current = await store.project(push.data.repository.full_name);
  if (current) {
    await syncProject(syncing, current, now);
  }
}

async function deleteBranch(gh: GitHub, repo: string, branch: string): Promise<void> {
  const remove: Write = { method: 'DELETE', path: `/repos/${repo}/git/refs/heads/${branch}` };
  await gh.send(remove, z.unknown()).catch((error: unknown) => {
    if (!(error instanceof GitHubError && (error.status === 404 || error.status === 422))) {
      throw error;
    }
  });
}

async function onPullClosed({ connect, store }: Handling, payload: unknown): Promise<void> {
  const closed = PullClosed.safeParse(payload);
  if (!closed.success) {
    return;
  }
  const { repository, installation, pull_request: pull } = closed.data;
  const ours = pull.head.repo?.full_name === repository.full_name;
  const owner = pull.head.label.split(':')[0] ?? '';
  const head = ours ? pull.head.ref : forkHead(owner, pull.head.ref);
  const proposal = await store.proposalByBranch(repository.full_name, head);
  if (!proposal) {
    return;
  }
  await store.closeProposal(proposal);
  if (ours) {
    await deleteBranch(await connect(installation.id), proposal.project, pull.head.ref);
  }
}

async function onInstallation({ connect, store, now, branches }: Handling, payload: unknown): Promise<void> {
  const parsed = InstallationEvent.safeParse(payload);
  if (!parsed.success) {
    return;
  }
  const { action, installation } = parsed.data;
  if (action === 'deleted') {
    await store.dropProjects(installation.id, []);
    return;
  }
  await syncInstallation({ gh: await connect(installation.id), store, branches }, installation.id, now);
}

/**
 * Act on a delivery: re-sync on a push to the default branch, re-discover an
 * installation, and settle a closed proposal. The App deletes the branch of a
 * proposal it pushed to the project; a branch on a contributor's fork is theirs.
 */
export async function handleDelivery(handling: Handling, delivery: Delivery): Promise<void> {
  if (delivery.event === 'push') {
    await onPush(handling, delivery.payload);
  } else if (delivery.event === 'pull_request') {
    await onPullClosed(handling, delivery.payload);
  } else if (delivery.event === 'installation' || delivery.event === 'installation_repositories') {
    await onInstallation(handling, delivery.payload);
  }
}
