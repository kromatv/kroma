import { z } from 'zod';
import { LocaleTag } from '#site/core/config';
import { stableLocales } from '#site/core/policy';
import { type AppCredentials, asInstallation } from '#site/github/app';
import { type GitHub, GitHubError } from '#site/github/client';
import { ForkDiverged, ForkPending } from '#site/github/fork';
import type { Sender } from '#site/github/lane';
import { type Outcome, propose } from '#site/github/propose';
import { syncProject } from '#site/github/sync';
import { SEND_FAILURES, type SendFailure } from '#site/lib/send-return';
import type { Project, Store, User } from '#site/store/store';
import { openProject } from './workspace';

/** Which language's edits to send. */
export const ProposalInput = z.object({ project: z.string().regex(/^[\w.-]+\/[\w.-]+$/), locale: LocaleTag });
export type ProposalInput = z.infer<typeof ProposalInput>;

/** `POST /api/proposals`: what to send, through the contributor's fork unless `via` is `lingua`, and the page to come back to. */
export const SendInput = ProposalInput.extend({
  via: z.enum(['fork', 'lingua']).default('fork'),
  to: z.string().max(512).optional(),
});

const COOLDOWN = 20;

/** What sending came to, as the route answers it. */
export type ProposalResult =
  | { status: 200; body: { kind: 'proposed'; number: number; url: string } | { kind: 'nothing' } }
  | { status: 404 | 409 | 422 | 429 | 502 | 503; reason: SendFailure; error: string };

/** A send: who it is for, and the client GitHub handed back for them when they send as themselves. Without it, the App sends. */
export interface Sending {
  app: AppCredentials;
  user: User;
  input: ProposalInput;
  origin: string;
  as?: GitHub;
}

type Refused = Exclude<ProposalResult, { status: 200 }>;

const refused = (status: Refused['status'], reason: SendFailure, error = SEND_FAILURES[reason]): Refused => ({ status, reason, error });

function resultOf(outcome: Outcome): ProposalResult {
  if (outcome.kind === 'incomplete') {
    return refused(422, 'incomplete', `Translate the general form of ${outcome.keys.join(', ')} before its plural forms`);
  }
  return {
    status: 200,
    body: outcome.kind === 'proposed' ? { kind: 'proposed', number: outcome.proposal.prNumber, url: outcome.proposal.prUrl } : { kind: 'nothing' },
  };
}

function failure(error: unknown): Refused {
  if (error instanceof GitHubError && error.status === 409) return refused(409, 'conflict');
  if (error instanceof ForkDiverged) return refused(409, 'diverged');
  if (error instanceof ForkPending) return refused(503, 'forking');
  console.error('lingua: proposal failed', error);
  return refused(502, 'failed');
}

async function sendSynced(store: Store, sending: Sending & { before: Project }, now: number): Promise<ProposalResult> {
  const { before, user, input } = sending;
  const gh = await asInstallation(sending.app, before.installationId);
  await syncProject({ gh, store }, before, now);
  const workspace = (await openProject(store, before.id, user))?.workspace;
  const project = await store.project(before.id);
  if (!project || !workspace) return refused(404, 'missing', 'This project has no usable lingua.json or i18n.json');
  if (!workspace.locales.includes(input.locale)) return refused(404, 'missing', 'This project does not offer that language');
  const read = ['', workspace.policy.source, input.locale, ...stableLocales(workspace.policy)];
  const files = await store.files(project.id, [...new Set(read)]);
  const sender: Sender = sending.as ? { kind: 'fork', gh: sending.as } : { kind: 'app', gh };
  const proposing = { project, root: workspace.root, files, user, locale: input.locale, origin: sending.origin, now };
  return resultOf(await propose(sender, store, proposing));
}

/** Sync the project with its default branch, then send the contributor's edits for the language to their pull request. */
export async function sendProposal(store: Store, sending: Sending, now: number): Promise<ProposalResult> {
  const { user, input } = sending;
  const before = await store.project(input.project);
  if (!before) return refused(404, 'missing', 'Lingua does not translate this project');
  const last = await store.proposal(before.id, user.id, input.locale);
  if (last && now - last.updatedAt < COOLDOWN) return refused(429, 'busy');
  try {
    return await sendSynced(store, { ...sending, before }, now);
  } catch (error) {
    return failure(error);
  }
}
