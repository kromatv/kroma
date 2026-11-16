import { z } from 'zod';
import { CONFIG_PATH } from '#site/core/config';
import { type AppCredentials, asInstallation } from '#site/github/app';
import { GitHubError, type Write } from '#site/github/client';
import { discoverInstallation, type Syncing, syncProject } from '#site/github/sync';
import type { Store } from '#site/store/store';

/** Whether `signature` (`X-Hub-Signature-256`) is GitHub's HMAC of `body` under the webhook secret. */
export async function verifySignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature?.startsWith('sha256=')) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const given = signature.slice('sha256='.length);
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
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
    head: z.object({ ref: z.string(), repo: z.object({ full_name: z.string() }).nullable() }),
  }),
});

const InstallationEvent = z.object({ action: z.string(), installation: Installation });

/** One delivery GitHub sent, already verified. */
export interface Delivery {
  event: string;
  payload: unknown;
}

/** What a delivery is handled with. */
export interface Handling {
  app: AppCredentials;
  store: Store;
  now: number;
}

/** Find every repository an installation reaches with a `lingua.json`, then sync each one. */
export async function syncInstallation(syncing: Syncing, installationId: number, now: number): Promise<void> {
  await discoverInstallation(syncing, installationId);
  const projects = (await syncing.store.projects()).filter((p) => p.installationId === installationId);
  await Promise.all(projects.map((project) => syncProject(syncing, project, now)));
}

async function onPush({ app, store, now }: Handling, payload: unknown): Promise<void> {
  const push = Push.safeParse(payload);
  if (!push.success || push.data.ref !== `refs/heads/${push.data.repository.default_branch}`) {
    return;
  }
  const syncing = { gh: await asInstallation(app, push.data.installation.id), store };
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

async function onPullClosed({ app, store }: Handling, payload: unknown): Promise<void> {
  const closed = PullClosed.safeParse(payload);
  const sameRepo = closed.data?.pull_request.head.repo?.full_name === closed.data?.repository.full_name;
  if (!closed.success || !sameRepo) {
    return;
  }
  const branch = closed.data.pull_request.head.ref;
  const proposal = await store.proposalByBranch(closed.data.repository.full_name, branch);
  if (!proposal) {
    return;
  }
  await store.closeProposal(proposal);
  const gh = await asInstallation(app, closed.data.installation.id);
  const remove: Write = { method: 'DELETE', path: `/repos/${proposal.project}/git/refs/heads/${branch}` };
  await gh.send(remove, z.unknown()).catch((error: unknown) => {
    if (!(error instanceof GitHubError && (error.status === 404 || error.status === 422))) {
      throw error;
    }
  });
}

async function onInstallation({ app, store, now }: Handling, payload: unknown): Promise<void> {
  const parsed = InstallationEvent.safeParse(payload);
  if (!parsed.success) {
    return;
  }
  const { action, installation } = parsed.data;
  if (action === 'deleted') {
    await store.dropProjects(installation.id, []);
    return;
  }
  await syncInstallation({ gh: await asInstallation(app, installation.id), store }, installation.id, now);
}

/** Act on a delivery: re-sync on a push to the default branch, settle a closed proposal, re-discover an installation. */
export async function handleDelivery(handling: Handling, delivery: Delivery): Promise<void> {
  if (delivery.event === 'push') {
    await onPush(handling, delivery.payload);
  } else if (delivery.event === 'pull_request') {
    await onPullClosed(handling, delivery.payload);
  } else if (delivery.event === 'installation' || delivery.event === 'installation_repositories') {
    await onInstallation(handling, delivery.payload);
  }
}
