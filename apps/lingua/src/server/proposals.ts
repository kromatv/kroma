import { z } from 'zod';
import { LocaleTag, parseConfig } from '#site/core/config';
import { type AppCredentials, asInstallation } from '#site/github/app';
import { GitHubError } from '#site/github/client';
import { propose } from '#site/github/propose';
import { syncProject } from '#site/github/sync';
import type { Store, User } from '#site/store/store';

/** `POST /api/proposals`: which language's edits to send. */
export const ProposalInput = z.object({ project: z.string().regex(/^[\w.-]+\/[\w.-]+$/), locale: LocaleTag });
export type ProposalInput = z.infer<typeof ProposalInput>;

const COOLDOWN = 20;

/** What sending came to, as the route answers it. */
export type ProposalResult =
  | { status: 200; body: { kind: 'proposed'; number: number; url: string } | { kind: 'nothing' } }
  | { status: 404 | 409 | 429 | 502; error: string };

/** Sync the project with its default branch, then send the contributor's edits for the language to their pull request. */
export async function sendProposal(
  store: Store,
  app: AppCredentials,
  user: User,
  input: ProposalInput,
  origin: string,
  now: number,
): Promise<ProposalResult> {
  const before = await store.project(input.project);
  if (!before) return { status: 404, error: 'Lingua does not translate this project' };
  const last = await store.proposal(before.id, user.id, input.locale);
  if (last && now - last.updatedAt < COOLDOWN) return { status: 429, error: 'Wait a few seconds before sending again' };
  try {
    const gh = await asInstallation(app, before.installationId);
    await syncProject({ gh, store }, before, now);
    const project = await store.project(before.id);
    const parsed = project?.config ? parseConfig(project.config) : null;
    if (!project || !parsed?.ok) return { status: 404, error: 'This project has no usable lingua.json' };
    const config = parsed.config;
    if (input.locale !== config.source && !config.locales.includes(input.locale)) {
      return { status: 404, error: 'This project does not offer that language' };
    }
    const files = await store.files(project.id, [...new Set([config.source, input.locale])]);
    const outcome = await propose(gh, store, { project, config, files, user, locale: input.locale, origin, now });
    return {
      status: 200,
      body:
        outcome.kind === 'proposed'
          ? { kind: 'proposed', number: outcome.proposal.prNumber, url: outcome.proposal.prUrl }
          : { kind: 'nothing' },
    };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 409) {
      return { status: 409, error: 'Your branch conflicts with the default branch. A maintainer has to resolve it on GitHub.' };
    }
    console.error('lingua: proposal failed', error);
    return { status: 502, error: 'GitHub refused the change. Try again in a minute.' };
  }
}
