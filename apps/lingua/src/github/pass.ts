import type { Project } from '#site/store/store';
import { unlessMissing } from './client';
import { type Syncing, syncProject } from './sync';

const LEASE = 60;
const STALE = 120;

/** A repository `LINGUA_PROJECTS` lists, and the branch it pins, null for the default one. */
export interface ListedProject {
  id: string;
  branch: string | null;
}

/** A listed repository GitHub did not answer for, and what it answered. */
export interface Unread {
  id: string;
  error: unknown;
}

/** What a pass came to: it ran to the end, a failure stopped it, or it did not start. */
export type Pass = { kind: 'synced' } | { kind: 'failed'; error: unknown } | { kind: 'skipped' };

const settled = (held: Project | undefined, listed: ListedProject) =>
  held !== undefined &&
  (listed.branch === null ? !held.pinned : held.pinned && held.branch === listed.branch);

async function track({ reader, store }: Syncing, listed: ListedProject): Promise<Unread | null> {
  const { id } = listed;
  if (listed.branch !== null) {
    await store.upsertProject({ id, branch: listed.branch, pinned: true });
    return null;
  }
  try {
    await store.upsertProject({ id, branch: await reader.defaultBranch(id), pinned: false });
    return null;
  } catch (error) {
    return { id, error };
  }
}

/**
 * Hold a project for every repository listed, on its pinned branch or on its
 * default one, read from GitHub the first time, and forget every project no
 * longer listed. Returns the repositories GitHub did not answer for, left out
 * until it does.
 */
export async function trackProjects(
  syncing: Syncing,
  listed: readonly ListedProject[],
): Promise<Unread[]> {
  const held = new Map((await syncing.store.projects()).map((p) => [p.id, p]));
  const moved = listed.filter((entry) => !settled(held.get(entry.id), entry));
  const tracked = await Promise.all(moved.map((entry) => track(syncing, entry)));
  await syncing.store.dropProjects(listed.map((entry) => entry.id));
  return tracked.filter((unread) => unread !== null);
}

async function settleProposals({ reader, store }: Syncing, project: string): Promise<void> {
  const open = await store.proposalsOf(project);
  const checked = open.slice(0, Math.max(0, reader.left));
  const states = await Promise.all(
    checked.map((p) => unlessMissing(reader.pullState(project, p.prNumber))),
  );
  const closed = checked.filter((_, i) => states[i] === 'closed');
  await Promise.all(closed.map((p) => store.closeProposal(p)));
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function passed(syncing: Syncing, project: Project, now: number): Promise<Pass> {
  try {
    await syncProject(syncing, project, now);
    await settleProposals(syncing, project.id);
    return { kind: 'synced' };
  } catch (error) {
    return { kind: 'failed', error };
  }
}

/**
 * Sync project `id` and forget every proposal whose pull request GitHub closed
 * or merged, as far as the reader's budget goes, under a lease so two passes
 * never run over one project at once. Then record when the pass ended and the
 * error that stopped it. Skipped while another pass holds the lease.
 */
export async function passOver(syncing: Syncing, id: string, now: number): Promise<Pass> {
  const project = await syncing.store.claimSync(id, now, now + LEASE);
  if (!project) {
    return { kind: 'skipped' };
  }
  const pass = await passed(syncing, project, now);
  const error = pass.kind === 'failed' ? messageOf(pass.error) : null;
  await syncing.store.endSync(id, { at: now, error });
  return pass;
}

/** Pass over project `id` when its last pass ended more than two minutes ago; skipped otherwise. */
export async function passIfStale(syncing: Syncing, id: string, now: number): Promise<Pass> {
  const project = await syncing.store.project(id);
  if (!project || (project.checkedAt !== null && now - project.checkedAt < STALE)) {
    return { kind: 'skipped' };
  }
  return passOver(syncing, id, now);
}
